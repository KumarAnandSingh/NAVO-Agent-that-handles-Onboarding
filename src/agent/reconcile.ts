/**
 * The core of the agent loop, shared by every event handler: reconcile (evaluate risk and
 * dependencies, plan, act, repeat until nothing is left), runs and small helpers.
 */
import { and, eq } from "drizzle-orm";
import { isAtRisk } from "@/domain/risk-engine";
import type { RiskLevel } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import { employees, people, tasks } from "@/lib/db/schema";
import type { EventRow } from "@/services/events/queue";
import type { Workspace } from "@/services/workspace";
import { executeAction } from "./actions";
import { finishRun, recordStateChange, startRun, type AgentContext } from "./context";
import type { Narrator } from "./narration";
import { planActions } from "./playbooks";
import { loadSnapshot, type OnboardingSnapshot } from "./snapshot";
import { callTool } from "./tools/registry";
import { updateTaskTool } from "./tools";

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

export function payloadString(event: EventRow, key: string): string {
  const value = event.payload[key];
  if (typeof value !== "string") throw new Error(`Event ${event.type} is missing payload.${key}`);
  return value;
}

/** Run Navo for one employee in response to a trigger, inside the caller's transaction. */
export async function withRun(
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

export async function completeByKey(ctx: AgentContext, key: string, note: string, reason: string, fulfilledBy?: string): Promise<boolean> {
  const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
  const task = snapshot.byKey.get(key as never);
  if (!task || task.status === "completed") return false;
  if (task.status === "blocked" && !fulfilledBy && !snapshot.graph.isEligible(task.id)) {
    throw new Error(`${task.key} finished externally while still blocked`);
  }
  await callTool(ctx, updateTaskTool, { taskId: task.id, status: "completed", note, reason, fulfilledBy });
  return true;
}
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function getPersonName(db: Queryable, workspaceId: string, personId: string): Promise<string | null> {
  const [row] = await db.select({ name: people.name }).from(people).where(and(eq(people.workspaceId, workspaceId), eq(people.id, personId)));
  return row?.name ?? null;
}
