/**
 * The simulated clock. Events wait in the queue until the workspace clock reaches them;
 * "Advance time" jumps to the next scheduled event and lets the world (HR, IT, vendor,
 * facilities, Navo's own checks) move forward. Each event runs in its own transaction
 * under a per-workspace advisory lock, so concurrent requests never interleave.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { markEvent, nextDueEvent, nextScheduledAfter, type EventRow } from "@/services/events/queue";
import { requireWorkspace } from "@/services/workspace";
import { handleEvent, type AgentDeps, type EventOutcome } from "./orchestrator";

export interface ProcessedEvent {
  id: number;
  type: string;
  label: string;
  dueAt: Date;
  outcome: EventOutcome | "failed";
  error?: string;
}

const MAX_EVENTS_PER_CALL = 400;

export async function lockWorkspace(db: Parameters<Parameters<Db["transaction"]>[0]>[0], workspaceId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`);
}

/** Process every scheduled event due at or before `until`, in time order. */
export async function processDue(db: Db, workspaceId: string, until: Date, deps: AgentDeps): Promise<ProcessedEvent[]> {
  const processed: ProcessedEvent[] = [];
  for (let i = 0; i < MAX_EVENTS_PER_CALL; i++) {
    let failedEvent: EventRow | null = null;
    let failure = "";
    let result: ProcessedEvent | null = null;
    try {
      result = await db.transaction(async (tx) => {
        await lockWorkspace(tx, workspaceId);
        const event = await nextDueEvent(tx, workspaceId, until);
        if (!event) return null;
        failedEvent = event;
        let workspace = await requireWorkspace(tx, workspaceId);
        if (event.dueAt.getTime() > workspace.simNow.getTime()) {
          await tx.update(workspaces).set({ simNow: event.dueAt }).where(eq(workspaces.id, workspaceId));
          workspace = { ...workspace, simNow: event.dueAt };
        }
        const outcome = await handleEvent(tx, workspace, event, deps);
        const latest = await requireWorkspace(tx, workspaceId);
        await markEvent(tx, event.id, outcome, latest.simNow);
        return { id: event.id, type: event.type, label: event.label, dueAt: event.dueAt, outcome };
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      result = null;
    }
    if (failure && failedEvent) {
      // The handler's transaction rolled back; record the failure so the queue moves on.
      const event: EventRow = failedEvent;
      await markEvent(db, event.id, "failed", event.dueAt, failure);
      console.error(`Event ${event.type} #${event.id} failed: ${failure}`);
      processed.push({ id: event.id, type: event.type, label: event.label, dueAt: event.dueAt, outcome: "failed", error: failure });
      continue;
    }
    if (failure) throw new Error(failure);
    if (!result) break;
    processed.push(result);
  }
  return processed;
}

export interface AdvanceResult {
  from: Date;
  to: Date;
  processed: ProcessedEvent[];
}

/** Jump the clock to the next scheduled event and process everything due by then. */
export async function advance(db: Db, workspaceId: string, deps: AgentDeps): Promise<AdvanceResult> {
  const workspace = await requireWorkspace(db, workspaceId);
  const from = workspace.simNow;
  const dueNow = await nextDueEvent(db, workspaceId, from);
  const next = dueNow ?? (await nextScheduledAfter(db, workspaceId, from));
  if (!next) return { from, to: from, processed: [] };
  const target = next.dueAt.getTime() > from.getTime() ? next.dueAt : from;
  const processed = await processDue(db, workspaceId, target, deps);
  const after = await requireWorkspace(db, workspaceId);
  return { from, to: after.simNow, processed };
}

/** Run the world forward to `time`, processing everything due on the way. */
export async function runUntil(db: Db, workspaceId: string, time: Date, deps: AgentDeps): Promise<AdvanceResult> {
  const workspace = await requireWorkspace(db, workspaceId);
  const from = workspace.simNow;
  const processed = await processDue(db, workspaceId, time, deps);
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const current = await requireWorkspace(tx, workspaceId);
    if (time.getTime() > current.simNow.getTime()) {
      await tx.update(workspaces).set({ simNow: time }).where(eq(workspaces.id, workspaceId));
    }
  });
  const after = await requireWorkspace(db, workspaceId);
  return { from, to: after.simNow, processed };
}
