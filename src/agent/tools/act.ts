/** Acting tools that reach other teams: reminders, escalation, HR and IT requests. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hoursOpen, slaDueAt } from "@/domain/sla";
import { atIst, formatDay, formatDayClock, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import { followUps } from "@/lib/db/schema";
import { createHrRequest, receiveEscalation, receiveReminder } from "@/mock-systems/hr";
import { createItTicket, type ItTicketType } from "@/mock-systems/it";
import { enqueueEvent } from "@/services/events/queue";
import { getEmployee, getTask, nextCounter, updateTask } from "@/services/onboarding-state/repository";
import { recordStateChange } from "../context";
import { defineTool, formatArgs } from "./registry";
import { taskKeyOf } from "./read";

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
