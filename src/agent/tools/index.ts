import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { COMPANY } from "@/content/company";
import { describeDecision, checkPermission } from "@/domain/permission-engine";
import { hoursOpen, slaDueAt } from "@/domain/sla";
import { atIst, formatDay, formatDayClock, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import { approvals, followUps, notifications } from "@/lib/db/schema";
import { bookEvent } from "@/mock-systems/calendar";
import { createHrRequest, receiveEscalation, receiveReminder } from "@/mock-systems/hr";
import { createItTicket, type ItTicketType } from "@/mock-systems/it";
import { enrol } from "@/mock-systems/learning";
import { cancelScheduled, enqueueEvent } from "@/services/events/queue";
import { searchPolicies } from "@/services/policy-retrieval";
import { getEmployee, getTask, markDependenciesSatisfied, nextCounter, updateTask } from "@/services/onboarding-state/repository";
import { recordStateChange } from "../context";
import { loadSnapshot } from "../snapshot";
import { defineTool, formatArgs } from "./registry";

export const taskKeyOf = (taskId: string) => taskId.split("/")[1] ?? taskId;

const RISK_LABEL = { none: "NONE", low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL" } as const;

/* ---------------- Read tools ---------------- */

export const getEmployeeContext = defineTool({
  name: "get_employee_context",
  description: "Read the joiner's profile: role, manager, buddy, joining date, location and work mode.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const employee = await getEmployee(ctx.db, ctx.workspace.id, employeeId);
    return {
      summary: `${employee.role} · joins ${employee.joiningDate} · ${employee.workMode}`,
      data: employee,
    };
  },
});

export const getOnboardingState = defineTool({
  name: "get_onboarding_state",
  description: "Read every onboarding task with status, owner, deadline and risk.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    const overdue = snapshot.tasks.filter((t) => t.status !== "completed" && t.dueAt && t.dueAt.getTime() < ctx.clock.getTime());
    const open = snapshot.tasks.filter((t) => t.status !== "completed").length;
    const overdueText = overdue.length ? ` · ${overdue.length} overdue: ${overdue.map((t) => t.key).join(", ")}` : " · none overdue";
    return { summary: `${open} open tasks${overdueText}`, data: snapshot.tasks };
  },
});

export const getDependencies = defineTool({
  name: "get_dependencies",
  description: "Trace what a task waits on and what waits on it.",
  guard: "read",
  input: z.object({ taskId: z.string().min(1) }),
  summarizeArgs: ({ taskId }) => formatArgs({ task: taskKeyOf(taskId) }),
  async run(ctx, { taskId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
    const upstream = snapshot.graph.blockingPrerequisites(taskId).map((t) => t.key);
    const downstream = snapshot.graph
      .directDependents(taskId)
      .filter((t) => t.requiredForDay1)
      .map((t) => t.key);
    const parts = [upstream.join(", "), taskKeyOf(taskId), downstream.join(", ")].filter(Boolean);
    return { summary: parts.join(" → "), data: { upstream, downstream } };
  },
});

export const calculateDay1Risk = defineTool({
  name: "calculate_day1_risk",
  description: "Calculate Day 1 risk with explicit rules (working-day lead times, slack, overdue prerequisites).",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: () => formatArgs({ joining: "Day 1" }),
  async run(ctx, { employeeId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    if (snapshot.day1Passed) {
      const overdue = snapshot.tasks.filter((t) => t.status !== "completed" && t.dueAt && t.dueAt.getTime() < ctx.clock.getTime()).length;
      return { summary: `Day 1 has passed · ${overdue} overdue`, data: snapshot.risk };
    }
    const { day1Level, driver } = snapshot.risk;
    let detail = "";
    if (driver?.willMiss) detail = " · will miss Day 1";
    else if (driver && driver.slackWorkingDays !== null) detail = ` · ${driver.slackWorkingDays} working days slack`;
    else if (day1Level === "none") detail = snapshot.tasks.every((t) => !t.requiredForDay1 || t.status === "completed") ? " · ready" : " · on track";
    return { summary: `${RISK_LABEL[day1Level]}${detail}`, data: snapshot.risk };
  },
});

export const searchPolicyLibrary = defineTool({
  name: "search_policies",
  description: "Search Halden's current policy library. Returns the most relevant sections with their refs.",
  guard: "read",
  input: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(5).optional() }),
  summarizeArgs: ({ query }) => formatArgs({ query }),
  async run(ctx, { query, limit }) {
    const hits = await searchPolicies(ctx.db, query, { asOf: ctx.clock, limit: limit ?? 3 });
    return {
      summary: hits.length ? hits.map((h) => `${h.ref} ${h.title}`).join(" · ") : "no relevant policy",
      data: hits,
    };
  },
});

export const checkSla = defineTool({
  name: "check_sla",
  description: "Check whether a reminder has been answered within its 24-hour window.",
  guard: "read",
  input: z.object({ followUpId: z.string().min(1) }),
  summarizeArgs: ({ followUpId }) => formatArgs({ reminder: followUpId }),
  async run(ctx, { followUpId }) {
    const [row] = await ctx.db
      .select()
      .from(followUps)
      .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.id, followUpId)));
    if (!row) throw new Error(`Reminder ${followUpId} not found`);
    const hours = Math.floor(hoursOpen(row, ctx.clock));
    return { summary: row.status === "resolved" ? "answered" : `${hours}h · no response`, data: { hours, status: row.status } };
  },
});

export const checkPermissionTool = defineTool({
  name: "check_permission",
  description: "Ask the permission engine whether Navo may take an action on its own.",
  guard: "policy",
  input: z.object({ action: z.string().min(1), hoursSinceReminder: z.number().optional() }),
  summarizeArgs: ({ action }) => formatArgs({ action }),
  async run(_ctx, { action, hoursSinceReminder }) {
    const decision = checkPermission(action, { hoursSinceReminder });
    let summary = describeDecision(decision);
    if (action === "escalate_owner" && decision.decision === "allow") summary = "allowed after 24h · auto";
    if (action === "request_loaner") summary = "asset change · needs employee";
    return { summary, data: decision };
  },
});

/* ---------------- Acting tools ---------------- */

export const sendReminder = defineTool({
  name: "send_reminder",
  description: "Remind the owner of an overdue item, with the deadline and what depends on it.",
  guard: "auto",
  input: z.object({ taskId: z.string().min(1), toPersonId: z.string().min(1), message: z.string().min(10) }),
  summarizeArgs: ({ taskId, toPersonId }) => formatArgs({ to: toPersonId, task: taskKeyOf(taskId) }),
  async run(ctx, { taskId, toPersonId, message }) {
    const number = await nextCounter(ctx.db, ctx.workspace.id, "reminder");
    const id = `R-${number}`;
    const dueAt = slaDueAt(ctx.clock);
    await ctx.db.insert(followUps).values({
      workspaceId: ctx.workspace.id,
      id,
      employeeId: ctx.employeeId,
      taskId,
      kind: "reminder",
      toPersonId,
      message,
      sentAt: ctx.clock,
      slaDueAt: dueAt,
      status: "open",
    });
    await enqueueEvent(ctx.db, ctx.workspace.id, {
      type: "sla.check",
      source: "navo",
      label: `Reply window for ${id} closes`,
      dueAt,
      payload: { employeeId: ctx.employeeId, followUpId: id },
      idempotencyKey: `sla.check:${id}`,
    });
    await receiveReminder(ctx.db, ctx.workspace.id, ctx.workspace.scenario, { employeeId: ctx.employeeId, reminderId: id, sentAt: ctx.clock });
    await recordStateChange(ctx, `reminder ${id}`, null, "created");
    return { summary: `sent ${formatTime(ctx.clock)}`, data: { id, slaDueAt: dueAt } };
  },
});

export const escalateOwner = defineTool({
  name: "escalate_owner",
  description: "Escalate an unanswered reminder to the HR Operations lead, copying the original owner.",
  guard: "auto",
  input: z.object({ taskId: z.string(), followUpId: z.string(), toPersonId: z.string(), ccPersonId: z.string(), message: z.string().min(10) }),
  summarizeArgs: ({ toPersonId, ccPersonId }) => formatArgs({ to: toPersonId, cc: ccPersonId }),
  async permissionContext(ctx, { followUpId }) {
    const [row] = await ctx.db
      .select()
      .from(followUps)
      .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.id, followUpId)));
    return { hoursSinceReminder: row ? hoursOpen(row, ctx.clock) : 0 };
  },
  async run(ctx, { taskId, followUpId, toPersonId, ccPersonId, message }) {
    const number = await nextCounter(ctx.db, ctx.workspace.id, "escalation");
    const id = `E-${number}`;
    await ctx.db
      .update(followUps)
      .set({ status: "breached" })
      .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.id, followUpId)));
    await ctx.db.insert(followUps).values({
      workspaceId: ctx.workspace.id,
      id,
      employeeId: ctx.employeeId,
      taskId,
      kind: "escalation",
      toPersonId,
      ccPersonId,
      message,
      sentAt: ctx.clock,
      slaDueAt: slaDueAt(ctx.clock),
      status: "open",
    });
    await receiveEscalation(ctx.db, ctx.workspace.id, { employeeId: ctx.employeeId, escalationId: id, sentAt: ctx.clock });
    await recordStateChange(ctx, `reminder ${followUpId}`, "open", "breached");
    await recordStateChange(ctx, `escalation ${id}`, null, "created");
    return { summary: `sent ${formatTime(ctx.clock)}`, data: { id } };
  },
});

export const createHrRequestTool = defineTool({
  name: "create_hr_request",
  description: "Raise a request with HR (Employee ID, ID card).",
  guard: "auto",
  input: z.object({ taskId: z.string(), type: z.enum(["employee_id", "id_card"]), dueAt: z.date().nullable(), note: z.string() }),
  summarizeArgs: ({ type }) => formatArgs({ type }),
  async run(ctx, { taskId, type, dueAt, note }) {
    const request = await createHrRequest(ctx.db, ctx.workspace.id, { employeeId: ctx.employeeId, type, now: ctx.clock, dueAt, note });
    const task = await getTask(ctx.db, ctx.workspace.id, taskId);
    await updateTask(
      ctx.db,
      task,
      { status: "waiting", dueAt: type === "employee_id" ? dueAt : task.dueAt, statusNote: dueAt ? `HR · due ${formatShortDate(dueAt)}` : "HR · printing" },
      { actor: "navo", at: ctx.clock, reason: `${request.id} raised` },
    );
    await recordStateChange(ctx, task.key, task.status, "waiting");
    return { summary: dueAt ? `${request.id} · due ${formatShortDate(dueAt)}` : request.id, data: request };
  },
});

export const createItRequest = defineTool({
  name: "create_it_request",
  description: "Raise an IT ticket (laptop, email, VPN, access, tools, loaner).",
  guard: "auto",
  input: z.object({
    taskId: z.string(),
    type: z.enum(["laptop", "email", "vpn", "access", "tool_access", "loaner"]),
    detail: z.string(),
  }),
  summarizeArgs: ({ type }) => formatArgs({ type }),
  async run(ctx, { taskId, type, detail }) {
    const employee = await getEmployee(ctx.db, ctx.workspace.id, ctx.employeeId);
    const day1Start = atIst(employee.joiningDate, "09:00");
    const ticket = await createItTicket(ctx.db, ctx.workspace.id, {
      employeeId: ctx.employeeId,
      type: type as ItTicketType,
      detail,
      now: ctx.clock,
      day1Start,
      delayed: ctx.workspace.flags.itDelay === true,
    });
    const task = await getTask(ctx.db, ctx.workspace.id, taskId);
    const eta = ticket.expectedAt;
    if (type === "loaner") {
      await updateTask(ctx.db, task, { statusNote: `Loaner · ready ${weekdayName(eta)}` }, { actor: "navo", at: ctx.clock });
    } else if (task.status !== "completed") {
      const note = type === "access" ? `Live ${formatDay(eta)} ${formatTime(eta)}` : `Delivery ${formatDay(eta)}`;
      await updateTask(ctx.db, task, { status: "in_progress", statusNote: note }, { actor: "navo", at: ctx.clock, reason: `${ticket.id} raised` });
      await recordStateChange(ctx, task.key, task.status, "requested");
    }
    return { summary: `${ticket.id} · ready ${formatDayClock(eta)}`, data: ticket };
  },
});

export const scheduleMeeting = defineTool({
  name: "schedule_meeting",
  description: "Book a session on the joiner's calendar.",
  guard: "auto",
  input: z.object({
    title: z.string(),
    kind: z.string(),
    startsAt: z.date(),
    endsAt: z.date(),
    location: z.string(),
    withPersonId: z.string().nullable(),
    ownerType: z.enum(["employee", "hr", "hr_ops", "it", "manager", "buddy", "facilities", "vendor", "navo"]),
    linkedTaskId: z.string().nullable(),
  }),
  summarizeArgs: ({ title }) => formatArgs({ title }),
  async run(ctx, input) {
    const event = await bookEvent(ctx.db, ctx.workspace.id, {
      employeeId: ctx.employeeId,
      kind: input.kind,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withPersonId: input.withPersonId,
      ownerType: input.ownerType,
      taskId: input.linkedTaskId,
    });
    return { summary: `booked ${formatDayClock(event.startsAt)}`, data: event };
  },
});

export const schedulePickup = defineTool({
  name: "schedule_pickup",
  description: "Book one pickup slot for everything waiting for the joiner.",
  guard: "auto",
  input: z.object({ site: z.string(), startsAt: z.date(), endsAt: z.date(), items: z.array(z.string()).min(1), linkedTaskId: z.string() }),
  summarizeArgs: ({ startsAt }) => formatArgs({ site: COMPANY.pickupSite, at: formatDayClock(startsAt) }),
  async run(ctx, input) {
    const event = await bookEvent(ctx.db, ctx.workspace.id, {
      employeeId: ctx.employeeId,
      kind: "pickup",
      title: `Collect ${input.items.join(", ")}`,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.site,
      ownerType: "employee",
      taskId: null,
    });
    return { summary: "booked", data: event };
  },
});

export const enrolTraining = defineTool({
  name: "enrol_training",
  description: "Enrol the joiner in a course and block time on their calendar.",
  guard: "auto",
  input: z.object({ taskId: z.string(), course: z.string(), minutes: z.number().int().positive(), dueAt: z.date() }),
  summarizeArgs: ({ course }) => formatArgs({ course }),
  async run(ctx, { taskId, course, minutes, dueAt }) {
    const enrolment = await enrol(ctx.db, ctx.workspace.id, { employeeId: ctx.employeeId, course, minutes, dueAt });
    const task = await getTask(ctx.db, ctx.workspace.id, taskId);
    await updateTask(
      ctx.db,
      task,
      { status: "needs_user", dueAt, statusNote: `${minutes} min · due ${formatDay(dueAt)}` },
      { actor: "navo", at: ctx.clock, reason: "Enrolled" },
    );
    return { summary: `enrolled · due ${formatDay(dueAt)}`, data: enrolment };
  },
});

const STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  waiting: "waiting",
  in_progress: "in_progress",
  blocked: "blocked",
  needs_user: "needs_you",
  completed: "done",
};

export const updateTaskTool = defineTool({
  name: "update_task",
  description: "Update an onboarding task's status. Completing a task satisfies its dependencies and resolves open reminders.",
  guard: "auto",
  input: z.object({
    taskId: z.string(),
    status: z.enum(["pending", "waiting", "in_progress", "blocked", "needs_user", "completed"]),
    note: z.string().nullable(),
    reason: z.string().optional(),
    /**
     * Set when the need is met by something that doesn't depend on the task's prerequisites,
     * e.g. a loaner laptop covering Day 1 before the Employee ID exists. Recorded in the audit trail.
     */
    fulfilledBy: z.string().optional(),
  }),
  summarizeArgs: ({ taskId, status, fulfilledBy }) =>
    `${taskKeyOf(taskId)}, ${formatArgs({ status: STATUS_LABEL[status], via: fulfilledBy })}`,
  async run(ctx, { taskId, status, note, reason, fulfilledBy }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === status) {
      if (note !== null && note !== task.statusNote) {
        await updateTask(ctx.db, task, { statusNote: note }, { actor: "navo", at: ctx.clock });
      }
      return { summary: "unchanged", data: task };
    }
    const prerequisitesComplete = fulfilledBy !== undefined || snapshot.graph.isEligible(taskId);
    let current = task;
    if (current.status === "blocked" && status === "completed") {
      // Work that finishes the moment it starts (e.g. a booking) still passes through in_progress.
      current = await updateTask(ctx.db, current, { status: "in_progress" }, { actor: "navo", at: ctx.clock, reason, prerequisitesComplete });
    }
    const updated = await updateTask(
      ctx.db,
      current,
      { status, statusNote: note },
      { actor: "navo", at: ctx.clock, reason: fulfilledBy ? `Fulfilled by ${fulfilledBy}` : reason, prerequisitesComplete },
    );
    await recordStateChange(ctx, task.key, STATUS_LABEL[task.status] ?? task.status, STATUS_LABEL[status] ?? status);
    if (status === "completed") {
      await markDependenciesSatisfied(ctx.db, ctx.workspace.id, taskId);
      const open = snapshot.followUps.filter((f) => f.taskId === taskId && f.status !== "resolved");
      for (const followUp of open) {
        await ctx.db
          .update(followUps)
          .set({ status: "resolved", resolvedAt: ctx.clock })
          .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.id, followUp.id)));
        await recordStateChange(ctx, `${followUp.kind} ${followUp.id}`, followUp.status, "resolved");
        await cancelScheduled(ctx.db, ctx.workspace.id, "sla.check", { followUpId: followUp.id }, ctx.clock);
      }
      // A re-check scheduled for this task is moot once it is done.
      await cancelScheduled(ctx.db, ctx.workspace.id, "navo.deadline_check", { taskId }, ctx.clock);
    }
    return { summary: "ok", data: updated };
  },
});

export const notifyEmployee = defineTool({
  name: "notify_employee",
  description: "Send the joiner a short update. Push only when something needs them.",
  guard: "auto",
  input: z.object({ title: z.string(), body: z.string(), needsYou: z.boolean(), composedBy: z.enum(["claude", "template"]) }),
  summarizeArgs: ({ title }) => formatArgs({ summary: title }),
  async run(ctx, { title, body, needsYou, composedBy }) {
    await ctx.db.insert(notifications).values({
      workspaceId: ctx.workspace.id,
      recipientId: ctx.employeeId,
      kind: needsYou ? "needs_you" : "update",
      title,
      body,
      at: ctx.clock,
      push: needsYou,
      composedBy,
    });
    return { summary: needsYou ? "sent · push" : "sent", data: null };
  },
});

export const notifyOwner = defineTool({
  name: "notify_owner",
  description: "Tell an owner (HR, IT, payroll) that something changed.",
  guard: "auto",
  input: z.object({ toPersonId: z.string(), title: z.string(), body: z.string() }),
  summarizeArgs: ({ toPersonId }) => formatArgs({ to: toPersonId }),
  async run(ctx, { toPersonId, title, body }) {
    await ctx.db.insert(notifications).values({
      workspaceId: ctx.workspace.id,
      recipientId: toPersonId,
      kind: "update",
      title,
      body,
      at: ctx.clock,
    });
    return { summary: "sent", data: null };
  },
});

export const requestApproval = defineTool({
  name: "request_approval",
  description: "Ask the joiner to approve a sensitive action before Navo takes it.",
  guard: "approval",
  input: z.object({ action: z.string(), title: z.string(), detail: z.string(), reason: z.string(), payload: z.record(z.string(), z.unknown()) }),
  summarizeArgs: ({ action }) => formatArgs({ from: "anand", action: action === "request_loaner" ? "loaner" : action }),
  async run(ctx, { action, title, detail, reason, payload }) {
    const number = await nextCounter(ctx.db, ctx.workspace.id, "approval");
    const id = `A-${number}`;
    await ctx.db.insert(approvals).values({
      workspaceId: ctx.workspace.id,
      id,
      employeeId: ctx.employeeId,
      action,
      payload,
      requestedFrom: ctx.employeeId,
      title,
      detail,
      reason,
      status: "pending",
      createdAt: ctx.clock,
    });
    ctx.awaitingApproval = true;
    await recordStateChange(ctx, `approval ${id}`, null, "pending");
    return { summary: "pending", data: { id } };
  },
});

export const onEvent = defineTool({
  name: "on_event",
  description: "Receive an update from HR, IT, a vendor, facilities or the calendar.",
  guard: "event",
  input: z.object({ type: z.string(), detail: z.string() }),
  summarizeArgs: ({ type }) => type,
  async run(_ctx, { detail }) {
    return { summary: detail, data: null };
  },
});

export const onApproval = defineTool({
  name: "on_approval",
  description: "Receive the joiner's decision on an approval request.",
  guard: "event",
  input: z.object({ approvalId: z.string(), decision: z.enum(["approved", "declined"]) }),
  summarizeArgs: ({ approvalId }) => `${approvalId}, by="anand"`,
  async run(_ctx, { decision }) {
    return { summary: decision, data: null };
  },
});

/** Read-only tools Claude may call from Ask Navo. */
export const READ_TOOLS = [getEmployeeContext, getOnboardingState, getDependencies, calculateDay1Risk, searchPolicyLibrary];
