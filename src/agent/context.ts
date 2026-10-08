import { eq } from "drizzle-orm";
import type { ActivityPhase } from "@/domain/types";
import { addMinutes } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { activities, agentRuns, notifications, stateChanges, workspaces } from "@/lib/db/schema";
import type { Workspace } from "@/services/workspace";
import type { Narrator } from "./narration";

/**
 * Everything one agent run needs. Runs execute inside a database transaction, so a
 * failed run leaves no partial state behind. `clock` is simulated time: Navo takes a
 * minute per reasoning phase, which is what produces the Noticed → Decided → Acted times.
 */
export interface AgentContext {
  db: Queryable;
  workspace: Workspace;
  employeeId: string;
  runId: number;
  clock: Date;
  seq: number;
  narrator: Narrator;
  acted: boolean;
  awaitingApproval: boolean;
}

export async function startRun(
  db: Queryable,
  workspace: Workspace,
  employeeId: string,
  trigger: string,
  at: Date,
  narrator: Narrator,
  eventId?: number,
): Promise<AgentContext> {
  const [run] = await db
    .insert(agentRuns)
    .values({ workspaceId: workspace.id, employeeId, eventId: eventId ?? null, trigger, startedAt: at })
    .returning({ id: agentRuns.id });
  if (!run) throw new Error("Could not start agent run");
  return { db, workspace, employeeId, runId: run.id, clock: at, seq: 0, narrator, acted: false, awaitingApproval: false };
}

export async function finishRun(ctx: AgentContext, summary: string, failed = false): Promise<void> {
  const outcome = failed ? "failed" : ctx.awaitingApproval ? "awaiting_approval" : ctx.acted ? "acted" : "no_action";
  await ctx.db
    .update(agentRuns)
    .set({ finishedAt: ctx.clock, outcome, summary })
    .where(eq(agentRuns.id, ctx.runId));
  if (ctx.clock.getTime() > ctx.workspace.simNow.getTime()) {
    await ctx.db.update(workspaces).set({ simNow: ctx.clock }).where(eq(workspaces.id, ctx.workspace.id));
    ctx.workspace = { ...ctx.workspace, simNow: ctx.clock };
  }
}

/** Advance the simulated clock while Navo works through a phase. */
export function tick(ctx: AgentContext, minutes = 1): void {
  ctx.clock = addMinutes(ctx.clock, minutes);
}

export interface ActivityInput {
  caseKey: string;
  phase: ActivityPhase;
  summary: string;
  taskId?: string;
  action?: string;
  userVisible?: boolean;
  /** When set, this activity appears in the home "What Navo did" list. */
  headline?: string;
  headlineDetail?: string;
}

export async function recordActivity(ctx: AgentContext, input: ActivityInput): Promise<void> {
  await ctx.db.insert(activities).values({
    workspaceId: ctx.workspace.id,
    employeeId: ctx.employeeId,
    runId: ctx.runId,
    caseKey: input.caseKey,
    at: ctx.clock,
    actor: "navo",
    phase: input.phase,
    summary: input.summary,
    relatedTaskId: input.taskId ?? null,
    action: input.action ?? null,
    userVisible: input.userVisible ?? true,
    headline: input.headline ?? null,
    headlineDetail: input.headlineDetail ?? null,
  });
}

export async function recordStateChange(ctx: AgentContext, label: string, from: string | null, to: string): Promise<void> {
  if (from === to) return;
  await ctx.db.insert(stateChanges).values({
    workspaceId: ctx.workspace.id,
    runId: ctx.runId,
    label,
    fromValue: from,
    toValue: to,
    at: ctx.clock,
  });
}

export async function notify(
  ctx: AgentContext,
  recipientId: string,
  kind: "needs_you" | "update",
  title: string,
  body: string,
  composedBy: "claude" | "template" = "template",
): Promise<void> {
  await ctx.db.insert(notifications).values({
    workspaceId: ctx.workspace.id,
    recipientId,
    kind,
    title,
    body,
    at: ctx.clock,
    push: kind === "needs_you",
    composedBy,
  });
}
