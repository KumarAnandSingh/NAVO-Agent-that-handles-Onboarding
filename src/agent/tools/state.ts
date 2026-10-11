/** Tools that change onboarding state or tell people about it: tasks, notifications, approvals, events. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { approvals, followUps, notifications } from "@/lib/db/schema";
import { cancelScheduled } from "@/services/events/queue";
import { markDependenciesSatisfied, nextCounter, updateTask } from "@/services/onboarding-state/repository";
import { recordStateChange } from "../context";
import { loadSnapshot } from "../snapshot";
import { defineTool, formatArgs } from "./registry";
import { taskKeyOf } from "./read";

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
