/**
 * The onboarding agent's loop. One event in, then:
 * gather context → inspect state → evaluate dependencies and risk (deterministic) →
 * pick next-best actions (playbooks) → check permission → act through tools →
 * persist state → record activity → notify → re-evaluate until nothing is left to do.
 */
import { and, eq } from "drizzle-orm";
import { TIMELINE } from "@/content/timeline";
import { isAtRisk, riskRank } from "@/domain/risk-engine";
import { atIst, formatDayClock, formatShortDate, nextWorkingTime, weekdayName } from "@/domain/time";
import type { RiskLevel } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import { approvals, documents as documentsTable, employees, tasks } from "@/lib/db/schema";
import { getItTicket, markTicketReady } from "@/mock-systems/it";
import { completeHrRequest, findOpenHrRequest } from "@/mock-systems/hr";
import { clearCheck, markItemReady } from "@/mock-systems/vendor-facilities";
import { enqueueEvent, type EventRow } from "@/services/events/queue";
import { getEmployee } from "@/services/onboarding-state/repository";
import type { Workspace } from "@/services/workspace";
import { caseFor, executeAction } from "./actions";
import { finishRun, recordActivity, recordStateChange, startRun, tick, type AgentContext } from "./context";
import type { Narrator } from "./narration";
import { planActions } from "./playbooks";
import { loadSnapshot, type OnboardingSnapshot } from "./snapshot";
import { callTool } from "./tools/registry";
import {
  calculateDay1Risk,
  createItRequest,
  getDependencies,
  getOnboardingState,
  notifyEmployee,
  notifyOwner,
  onApproval,
  onEvent,
  taskKeyOf,
  updateTaskTool,
} from "./tools";

export interface AgentDeps {
  narrator: Narrator;
}

export type EventOutcome = "processed" | "ignored";

const MAX_PASSES = 8;

/** Persist the risk engine's view onto tasks and the employee, recording what changed. */
async function persistRisk(ctx: AgentContext, snapshot: OnboardingSnapshot): Promise<void> {
  for (const task of snapshot.tasks) {
    const assessed = snapshot.risk.byTask.get(task.id);
    const level: RiskLevel = assessed?.level ?? "none";
    if (level === task.riskLevel) continue;
    await ctx.db
      .update(tasks)
      .set({ riskLevel: level })
      .where(and(eq(tasks.workspaceId, ctx.workspace.id), eq(tasks.id, task.id)));
    const wasAtRisk = isAtRisk(task.riskLevel);
    const nowAtRisk = isAtRisk(level);
    if (wasAtRisk !== nowAtRisk && task.requiredForDay1) {
      const base = assessed?.overdue ? "overdue" : task.status === "blocked" ? "blocked" : task.status;
      await recordStateChange(ctx, task.key, nowAtRisk ? base : "at_risk", nowAtRisk ? "at_risk" : level === "none" ? "on_track" : level);
    }
  }
  const previous = snapshot.employee.day1Risk;
  if (previous !== snapshot.risk.day1Level) {
    await ctx.db
      .update(employees)
      .set({ day1Risk: snapshot.risk.day1Level })
      .where(and(eq(employees.workspaceId, ctx.workspace.id), eq(employees.personId, ctx.employeeId)));
    await recordStateChange(ctx, "day1_risk", previous, snapshot.risk.day1Level);
  }
}

/** Plan and act until the playbooks have nothing left to do. */
export async function reconcile(ctx: AgentContext): Promise<OnboardingSnapshot> {
  let snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    await persistRisk(ctx, snapshot);
    const actions = planActions(snapshot);
    if (actions.length === 0) return snapshot;
    for (const action of actions) await executeAction(ctx, snapshot, action);
    snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
  }
  await persistRisk(ctx, snapshot);
  return snapshot;
}

function payloadString(event: EventRow, key: string): string {
  const value = event.payload[key];
  if (typeof value !== "string") throw new Error(`Event ${event.type} is missing payload.${key}`);
  return value;
}

/** Run Navo for one employee in response to a trigger, inside the caller's transaction. */
async function withRun(
  db: Queryable,
  workspace: Workspace,
  employeeId: string,
  trigger: string,
  event: EventRow | null,
  deps: AgentDeps,
  body: (ctx: AgentContext) => Promise<string>,
): Promise<AgentContext> {
  const at = event && event.dueAt.getTime() > workspace.simNow.getTime() ? event.dueAt : workspace.simNow;
  const ctx = await startRun(db, workspace, employeeId, trigger, at, deps.narrator, event?.id);
  const summary = await body(ctx);
  await finishRun(ctx, summary);
  return ctx;
}

async function completeByKey(ctx: AgentContext, key: string, note: string, reason: string, fulfilledBy?: string): Promise<boolean> {
  const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
  const task = snapshot.byKey.get(key as never);
  if (!task || task.status === "completed") return false;
  if (task.status === "blocked" && !fulfilledBy && !snapshot.graph.isEligible(task.id)) {
    throw new Error(`${task.key} finished externally while still blocked`);
  }
  await callTool(ctx, updateTaskTool, { taskId: task.id, status: "completed", note, reason, fulfilledBy });
  return true;
}

/* ---------------- Event handlers ---------------- */

async function dailyCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  await withRun(db, workspace, employeeId, "Navo daily check", event, deps, async (ctx) => {
    await callTool(ctx, getOnboardingState, { employeeId });
    const before = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    if (before.risk.driver && riskRank(before.risk.day1Level) >= riskRank("medium")) {
      await callTool(ctx, getDependencies, { taskId: before.risk.driver.taskId });
    }
    const seqBefore = ctx.seq;
    const after = await reconcile(ctx);
    // If no action already showed the risk calculation, show it now.
    if (ctx.seq === seqBefore || !ctx.acted) await callTool(ctx, calculateDay1Risk, { employeeId });
    return ctx.acted ? `Acted on Day-1 risk (${after.risk.day1Level})` : `Checked ${after.tasks.length} items · no action needed`;
  });
  const next = nextWorkingTime(event.dueAt, "09:15");
  if (next.getTime() <= atIst(TIMELINE.first30End, "23:59").getTime()) {
    await enqueueEvent(db, workspace.id, {
      type: "navo.daily_check",
      source: "navo",
      label: "Navo daily check",
      dueAt: next,
      payload: { employeeId },
      idempotencyKey: `navo.daily_check:${employeeId}:${next.toISOString()}`,
    });
  }
  return "processed";
}

async function employeeIdIssued(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const number = payloadString(event, "employeeNumber");
  const employee = await getEmployee(db, workspace.id, employeeId);
  if (employee.employeeNumber) return "ignored"; // duplicate delivery: the ID already exists
  const request = await findOpenHrRequest(db, workspace.id, employeeId, "employee_id");
  if (request) await completeHrRequest(db, workspace.id, request.id, event.dueAt, number);
  await db
    .update(employees)
    .set({ employeeNumber: number })
    .where(and(eq(employees.workspaceId, workspace.id), eq(employees.personId, employeeId)));

  await withRun(db, workspace, employeeId, "HR issued Employee ID", event, deps, async (ctx) => {
    const issuedBy = event.payload.issuedBy === "neha.kapoor" ? "HR Ops" : "HR";
    await callTool(ctx, onEvent, { type: "hr.employee_id.issued", detail: number });
    const before = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    const hadRiskCase = before.followUps.some((f) => taskKeyOf(f.taskId) === "employee_id");
    await completeByKey(ctx, "employee_id", number, `${issuedBy} issued ${number}`);
    await recordActivity(ctx, {
      caseKey: "empid",
      phase: "Noticed",
      summary: `${issuedBy} issued Employee ID ${number}.`,
      taskId: before.byKey.get("employee_id")?.id,
      headline: issuedBy === "HR Ops" ? "HR Ops issued your ID" : "Employee ID received",
      headlineDetail: `${issuedBy} issued ${number}`,
    });
    tick(ctx);
    const after = await reconcile(ctx);
    const laptop = after.byKey.get("laptop");
    const hasOwnLaptop = after.tickets.some((t) => t.type === "laptop");
    if (laptop?.status === "completed" && !hasOwnLaptop && after.tickets.some((t) => t.type === "loaner")) {
      const result = await callTool(ctx, createItRequest, { taskId: laptop.id, type: "laptop", detail: "Own laptop (replaces loaner)" });
      await recordActivity(ctx, {
        caseKey: "empid",
        phase: "Acted",
        summary: `Requested your own laptop, ${result.data.id}. Swap the loaner when it arrives.`,
        taskId: laptop.id,
      });
    }
    await callTool(ctx, calculateDay1Risk, { employeeId });
    if (hadRiskCase) {
      const requests = after.tickets.filter((t) => t.type === "laptop" || t.type === "email");
      const requestText = requests.some((t) => t.type === "laptop") ? "laptop request" : "IT requests";
      const narration = await ctx.narrator.employeeUpdate({ kind: "blocker_cleared", facts: { blocker: "Employee ID", requests: requestText } });
      await callTool(ctx, notifyEmployee, { title: "Blocker cleared", body: narration.text, needsYou: false, composedBy: narration.composedBy });
      await recordActivity(ctx, { caseKey: "empid", phase: "Reported", summary: "Blocker cleared. Told Anand no action needed." });
    }
    return `Employee ID ${number} received; downstream requests raised`;
  });
  return "processed";
}

const TICKET_TASK: Record<string, string> = {
  laptop: "laptop",
  loaner: "laptop",
  email: "email",
  vpn: "vpn",
  access: "access_activation",
  tool_access: "tool_access",
};

async function ticketReady(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const ticket = await getItTicket(db, workspace.id, payloadString(event, "ticketId"));
  if (!ticket || ticket.status !== "in_progress") return "ignored";
  await markTicketReady(db, workspace.id, ticket.id, event.dueAt);
  const copy: Record<string, { note: string; headline?: string; detail?: string; summary: string }> = {
    laptop: { note: "At Building B", headline: "Laptop ready", detail: "Imaged with VPN · waiting at Building B", summary: `Laptop imaged and ready, ${ticket.id}.` },
    loaner: { note: "Loaner at Building B", headline: "Loaner reserved", detail: "At Building B for Day 1", summary: `Loaner laptop ready at Building B, ${ticket.id}.` },
    email: { note: "Ready · live Day 1", headline: "Email account ready", detail: "Live Monday 9:00", summary: `Email account created, ${ticket.id}.` },
    vpn: { note: "Configured", summary: `VPN set up on your laptop, ${ticket.id}.` },
    access: { note: "Live", headline: "Email and VPN switched on", detail: "Access live", summary: `IT switched on email, VPN and core tools, ${ticket.id}.` },
    tool_access: { note: "Ready", headline: "Jira and Figma ready", detail: ticket.id, summary: `Jira and Figma access ready, ${ticket.id}.` },
  };
  const entry = copy[ticket.type] ?? { note: "Ready", summary: `${ticket.id} done.` };
  await withRun(db, workspace, employeeId, `IT completed ${ticket.id}`, event, deps, async (ctx) => {
    await callTool(ctx, onEvent, { type: "it.ticket.ready", detail: ticket.id });
    const key = TICKET_TASK[ticket.type] ?? ticket.type;
    const completed = await completeByKey(ctx, key, entry.note, entry.summary, ticket.type === "loaner" ? ticket.id : undefined);
    await recordActivity(ctx, {
      caseKey: caseFor(key),
      phase: "Noticed",
      summary: completed ? entry.summary : `Your own laptop is ready too, ${ticket.id}. Swap it for the loaner at the IT desk any time.`,
      headline: completed ? entry.headline : undefined,
      headlineDetail: completed ? entry.detail : undefined,
    });
    await reconcile(ctx);
    return entry.summary;
  });
  return "processed";
}

async function ticketDelayed(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const ticket = await getItTicket(db, workspace.id, payloadString(event, "ticketId"));
  if (!ticket) return "ignored";
  await withRun(db, workspace, employeeId, `IT delayed ${ticket.id}`, event, deps, async (ctx) => {
    await callTool(ctx, onEvent, { type: "it.ticket.delayed", detail: `${ticket.id} · now ${formatDayClock(ticket.expectedAt)}` });
    await recordActivity(ctx, {
      caseKey: "empid",
      phase: "Noticed",
      summary: `IT moved ${ticket.id} to ${formatDayClock(ticket.expectedAt)}.`,
      taskId: undefined,
    });
    await callTool(ctx, calculateDay1Risk, { employeeId });
    await reconcile(ctx);
    return `Re-planned after IT delay on ${ticket.id}`;
  });
  return "processed";
}

async function simpleCompletion(
  db: Queryable,
  workspace: Workspace,
  event: EventRow,
  deps: AgentDeps,
  options: { key: string; note: string; trigger: string; eventType: string; detail: string; summary: string; headline?: string; headlineDetail?: string },
): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  await withRun(db, workspace, employeeId, options.trigger, event, deps, async (ctx) => {
    await callTool(ctx, onEvent, { type: options.eventType, detail: options.detail });
    const completed = await completeByKey(ctx, options.key, options.note, options.summary);
    if (completed) {
      await recordActivity(ctx, {
        caseKey: caseFor(options.key),
        phase: "Noticed",
        summary: options.summary,
        headline: options.headline,
        headlineDetail: options.headlineDetail,
      });
    }
    await reconcile(ctx);
    return options.summary;
  });
  return "processed";
}

async function slaCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const followUpId = payloadString(event, "followUpId");
  const snapshot = await loadSnapshot(db, workspace.id, employeeId, event.dueAt);
  const followUp = snapshot.followUps.find((f) => f.id === followUpId);
  if (!followUp || followUp.status === "resolved") return "ignored";
  await withRun(db, workspace, employeeId, `Reply window for ${followUpId} closed`, event, deps, async (ctx) => {
    await reconcile(ctx);
    return ctx.acted ? `Escalated ${followUpId}` : `${followUpId} still open`;
  });
  return "processed";
}

/** Navo re-checks at the last safe moment it computed when it first saw the risk. */
async function deadlineCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const taskId = payloadString(event, "taskId");
  const snapshot = await loadSnapshot(db, workspace.id, employeeId, event.dueAt);
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task || task.status === "completed") return "ignored";
  await withRun(db, workspace, employeeId, `Last safe start for ${task.name}`, event, deps, async (ctx) => {
    await callTool(ctx, calculateDay1Risk, { employeeId });
    await reconcile(ctx);
    return ctx.acted ? `Re-planned at the last safe start for ${task.name}` : "Still on track";
  });
  return "processed";
}

async function approvalDecided(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const approvalId = payloadString(event, "approvalId");
  const decision = payloadString(event, "decision") === "approved" ? "approved" : "declined";
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspace.id), eq(approvals.id, approvalId)));
  if (!approval) return "ignored";
  await withRun(db, workspace, employeeId, `Anand ${decision} ${approvalId}`, event, deps, async (ctx) => {
    await callTool(ctx, onApproval, { approvalId, decision });
    if (decision === "approved" && approval.action === "request_loaner") {
      const taskId = String(approval.payload.taskId);
      const result = await callTool(ctx, createItRequest, { taskId, type: "loaner", detail: "Loaner laptop for Day 1" });
      await recordActivity(ctx, {
        caseKey: "empid",
        phase: "Acted",
        summary: `Anand approved. Reserved loaner ${result.data.id}.`,
        taskId,
        headline: "Loaner reserved",
        headlineDetail: `Ready ${weekdayName(result.data.expectedAt)} · at Building B`,
      });
      await callTool(ctx, calculateDay1Risk, { employeeId });
    } else if (decision === "declined") {
      await recordActivity(ctx, { caseKey: "empid", phase: "Reported", summary: "You chose to wait for your own laptop. I'll keep chasing the Employee ID." });
    }
    await reconcile(ctx);
    return `Approval ${approvalId} ${decision}`;
  });
  return "processed";
}

async function employeeAction(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const action = payloadString(event, "action");
  await withRun(db, workspace, employeeId, event.label, event, deps, async (ctx) => {
    await callTool(ctx, onEvent, { type: `employee.${action}`, detail: event.label });
    if (action === "forms_submitted") {
      await callTool(ctx, notifyOwner, { toPersonId: "priya.nair", title: "Documents verified", body: `${employeeId}'s documents and forms are complete.` });
      await recordActivity(ctx, {
        caseKey: "docs",
        phase: "Acted",
        summary: "Verified documents and forms. Sent them to HR and payroll.",
        headline: "Documents verified",
        headlineDetail: "Sent to HR and payroll",
      });
      tick(ctx);
    }
    if (action === "documents_updated") {
      const docs = await db
        .select()
        .from(documentsTable)
        .where(and(eq(documentsTable.workspaceId, workspace.id), eq(documentsTable.employeeId, employeeId)));
      const rejected = docs.find((d) => d.status === "rejected");
      if (rejected) {
        await recordActivity(ctx, { caseKey: "docs", phase: "Noticed", summary: `${rejected.name}: ${rejected.note}. Asked you for another copy.` });
      } else if (docs.every((d) => d.status === "verified" || d.status === "under_review")) {
        await completeByKey(ctx, "documents", "All verified", "Documents verified");
        await recordActivity(ctx, {
          caseKey: "docs",
          phase: "Acted",
          summary: "All documents verified. The degree check is with the verification vendor.",
        });
      } else {
        const changed = docs.find((d) => d.type === event.payload.documentType);
        const copy: Record<string, string> = {
          address_proof: "Read your address proof. It matches your Aadhaar.",
          relieving_letter: "Updated your relieving date. Priya in HR is notified.",
        };
        if (changed) await recordActivity(ctx, { caseKey: "docs", phase: "Acted", summary: copy[changed.type] ?? `Read your ${changed.name.toLowerCase()}.` });
      }
    }
    if (action === "pickup_confirmed") {
      await callTool(ctx, notifyOwner, { toPersonId: "priya.nair", title: "Day 1 pickup complete", body: "ID card collected." });
      await callTool(ctx, notifyOwner, { toPersonId: "it.desk", title: "Day 1 pickup complete", body: "Laptop collected." });
      await recordActivity(ctx, { caseKey: "setup", phase: "Acted", summary: "Closed your pickup requests with HR and IT.", headline: "Day 1 pickup closed", headlineDetail: "HR and IT notified" });
    }
    if (action === "benefits_enrolled") {
      await callTool(ctx, notifyOwner, { toPersonId: "priya.nair", title: "Health cover enrolled", body: "Employee, spouse and 1 child." });
      await recordActivity(ctx, { caseKey: "benefits", phase: "Acted", summary: "Enrolled you in health cover. HR and the insurer are notified.", headline: "Health cover enrolled", headlineDetail: "You, spouse and child" });
    }
    if (action === "training_completed") {
      await callTool(ctx, notifyOwner, { toPersonId: "it.desk", title: "Security training complete", body: `Switch on access for ${employeeId}.` });
      await recordActivity(ctx, { caseKey: "setup", phase: "Acted", summary: "Training complete. Told IT to switch on your access.", headline: "Security training done", headlineDetail: "IT notified" });
    }
    await reconcile(ctx);
    return event.label;
  });
  return "processed";
}

/** Route one queued event to its handler. Throws on unknown types so nothing is silently lost. */
export async function handleEvent(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = typeof event.payload.employeeId === "string" ? event.payload.employeeId : null;
  if (employeeId) {
    const employee = await getEmployee(db, workspace.id, employeeId);
    if (!employee.simulated) return "ignored";
  }
  switch (event.type) {
    case "navo.daily_check":
      return dailyCheck(db, workspace, event, deps);
    case "hr.employee_id_issued":
      return employeeIdIssued(db, workspace, event, deps);
    case "hr.id_card_printed": {
      const request = typeof event.payload.requestId === "string" ? event.payload.requestId : null;
      if (request) await completeHrRequest(db, workspace.id, request, event.dueAt);
      return simpleCompletion(db, workspace, event, deps, {
        key: "id_card",
        note: "Printed",
        trigger: "HR printed ID card",
        eventType: "hr.id_card.printed",
        detail: "ready",
        summary: "HR printed your ID card.",
        headline: "ID card printed",
        headlineDetail: "Collect at your Day 1 pickup",
      });
    }
    case "it.ticket_ready":
      return ticketReady(db, workspace, event, deps);
    case "it.ticket_delayed":
      return ticketDelayed(db, workspace, event, deps);
    case "vendor.check_cleared": {
      const cleared = await clearCheck(db, workspace.id, payloadString(event, "checkId"), event.dueAt);
      if (!cleared) return "ignored";
      return simpleCompletion(db, workspace, event, deps, {
        key: "background_check",
        note: "Cleared",
        trigger: "Vendor cleared background check",
        eventType: "vendor.bgv.cleared",
        detail: "ok",
        summary: "Background check cleared by the vendor.",
        headline: "Background check cleared",
        headlineDetail: "Vendor confirmed",
      });
    }
    case "facilities.item_ready": {
      const ready = await markItemReady(db, workspace.id, payloadString(event, "itemId"), event.dueAt);
      if (!ready) return "ignored";
      return simpleCompletion(db, workspace, event, deps, {
        key: "onboarding_kit",
        note: "Ready at Building B",
        trigger: "Facilities prepared the kit",
        eventType: "facilities.kit.ready",
        detail: "ok",
        summary: "Facilities has your onboarding kit ready.",
      });
    }
    case "calendar.event_ended": {
      const taskId = payloadString(event, "taskId");
      return simpleCompletion(db, workspace, event, deps, {
        key: taskKeyOf(taskId),
        note: `Done ${formatShortDate(event.dueAt)}`,
        trigger: "Session ended",
        eventType: "calendar.event.ended",
        detail: taskKeyOf(taskId),
        summary: `${event.label.replace(/ ends$/, "")} done.`,
      });
    }
    case "sla.check":
      return slaCheck(db, workspace, event, deps);
    case "navo.deadline_check":
      return deadlineCheck(db, workspace, event, deps);
    case "employee.approval_decided":
      return approvalDecided(db, workspace, event, deps);
    case "employee.action":
      return employeeAction(db, workspace, event, deps);
    default:
      throw new Error(`No handler for event type ${event.type}`);
  }
}
