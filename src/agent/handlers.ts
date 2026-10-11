/** One handler per event type: what Navo does when something happens in the outside world. */
import { and, eq } from "drizzle-orm";
import { TIMELINE } from "@/content/timeline";
import { riskRank } from "@/domain/risk-engine";
import { findFreeSlot } from "@/domain/scheduling";
import { atIst, formatDayClock, nextWorkingTime, weekdayName } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { approvals, calendarEvents, documents as documentsTable, employees, itTickets } from "@/lib/db/schema";
import { getItTicket, markTicketReady } from "@/mock-systems/it";
import { completeHrRequest, findOpenHrRequest } from "@/mock-systems/hr";
import { cancelScheduled, enqueueEvent, type EventRow } from "@/services/events/queue";
import { getEmployee } from "@/services/onboarding-state/repository";
import type { Workspace } from "@/services/workspace";
import { caseFor } from "./actions";
import { narrate, recordActivity, tick } from "./context";
import { loadSnapshot } from "./snapshot";
import { callTool } from "./tools/registry";
import { calculateDay1Risk, createItRequest, getDependencies, getOnboardingState, notifyEmployee, notifyOwner, onApproval, onEvent, scheduleMeeting, taskKeyOf } from "./tools";
import type { AgentDeps, EventOutcome} from "./reconcile";
import { reconcile, payloadString, withRun, completeByKey, capitalise, getPersonName } from "./reconcile";

/* ---------------- Event handlers ---------------- */

export async function dailyCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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
    if (!ctx.acted) return `Checked ${after.tasks.length} items · no action needed`;
    return after.day1Passed ? "Followed up on overdue items" : `Acted on Day-1 risk (${after.risk.day1Level})`;
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

export async function employeeIdIssued(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = payloadString(event, "employeeId");
  const number = payloadString(event, "employeeNumber");
  const employee = await getEmployee(db, workspace.id, employeeId);
  if (employee.employeeNumber) return "ignored"; // duplicate delivery: the ID already exists
  // Other deliveries of the same news (HR's own reply vs the console) and the re-check
  // at the last safe start no longer matter.
  await cancelScheduled(db, workspace.id, "hr.employee_id_issued", { employeeId }, event.dueAt, event.id);
  await cancelScheduled(db, workspace.id, "navo.deadline_check", { employeeId }, event.dueAt);
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
      const narration = await narrate(ctx, { kind: "blocker_cleared", facts: { blocker: "Employee ID", requests: requestText } });
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

export async function ticketReady(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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
    tool_access: { note: "Ready", headline: "Project tools ready", detail: ticket.id, summary: `Project tool access ready, ${ticket.id}.` },
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

export async function ticketDelayed(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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

export async function simpleCompletion(
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

export async function slaCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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
export async function deadlineCheck(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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

export async function approvalDecided(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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

export async function employeeAction(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
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
      const collected = Array.isArray(event.payload.collected) ? (event.payload.collected as string[]) : [];
      const loaner = (await db.select().from(itTickets).where(and(eq(itTickets.workspaceId, workspace.id), eq(itTickets.employeeId, employeeId)))).some((t) => t.type === "loaner");
      const items = [
        { key: "id", name: "ID card", owner: "priya.nair" },
        { key: "laptop", name: loaner ? "loaner laptop" : "laptop", owner: "it.desk" },
        { key: "kit", name: "onboarding kit", owner: "facilities.desk" },
      ];
      const missing = items.filter((item) => !collected.includes(item.key));
      for (const item of items) {
        const got = collected.includes(item.key);
        await callTool(ctx, notifyOwner, {
          toPersonId: item.owner,
          title: got ? "Day 1 pickup complete" : "Not collected on Day 1",
          body: got ? `${capitalise(item.name)} collected.` : `Please hold the ${item.name}. Navo will arrange a new pickup time.`,
        });
      }
      await recordActivity(ctx, {
        caseKey: "setup",
        phase: "Acted",
        summary: missing.length
          ? `Closed what you collected. Asked the team to hold your ${missing.map((m) => m.name).join(" and ")}.`
          : "Closed your pickup requests with HR and IT.",
        headline: "Day 1 pickup closed",
        headlineDetail: missing.length ? `${missing.length} item${missing.length === 1 ? "" : "s"} on hold for you` : "HR and IT notified",
      });
    }
    if (action === "benefits_enrolled") {
      await callTool(ctx, notifyOwner, { toPersonId: "priya.nair", title: "Health cover enrolled", body: "Employee, spouse and 1 child." });
      await recordActivity(ctx, { caseKey: "benefits", phase: "Acted", summary: "Enrolled you in health cover. HR and the insurer are notified.", headline: "Health cover enrolled", headlineDetail: "You, spouse and child" });
    }
    if (action === "walkthrough_requested") {
      const employee = await getEmployee(db, workspace.id, employeeId);
      const booked = await db.select().from(calendarEvents).where(and(eq(calendarEvents.workspaceId, workspace.id), eq(calendarEvents.employeeId, employeeId)));
      const slot = findFreeSlot(ctx.clock, booked);
      const buddy = employee.buddyId;
      if (slot && buddy) {
        const buddyName = (await getPersonName(db, workspace.id, buddy)) ?? "your buddy";
        await callTool(ctx, scheduleMeeting, {
          title: `Roadmap walkthrough with ${buddyName}`,
          kind: "walkthrough",
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          location: "Room 4A",
          withPersonId: buddy,
          ownerType: "buddy",
          linkedTaskId: null,
        });
        await callTool(ctx, notifyOwner, { toPersonId: buddy, title: "Roadmap walkthrough", body: `Booked ${formatDayClock(slot.startsAt)} with ${employeeId}.` });
        await recordActivity(ctx, {
          caseKey: "week1",
          phase: "Acted",
          summary: `Booked a roadmap walkthrough with ${buddyName.split(" ")[0]}, ${formatDayClock(slot.startsAt)}.`,
          headline: "Walkthrough booked",
          headlineDetail: `${buddyName.split(" ")[0]} · ${formatDayClock(slot.startsAt)}`,
        });
      } else {
        await recordActivity(ctx, { caseKey: "week1", phase: "Noticed", summary: "No free half hour in the next week. I'll suggest a time once your calendar opens up." });
      }
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
