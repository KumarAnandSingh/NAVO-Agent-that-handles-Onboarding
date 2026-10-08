import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { Queryable } from "@/lib/db/client";
import { events } from "@/lib/db/schema";

export type EventRow = typeof events.$inferSelect;

export interface NewEvent {
  type: string;
  source: string;
  label: string;
  payload?: Record<string, unknown>;
  dueAt: Date;
  /** Stable key for this occurrence; a second delivery with the same key is ignored. */
  idempotencyKey: string;
}

/**
 * Put an event on the workspace queue. Returns null when an event with the same
 * idempotency key already exists, so duplicate deliveries never run twice.
 */
export async function enqueueEvent(db: Queryable, workspaceId: string, event: NewEvent): Promise<EventRow | null> {
  const [row] = await db
    .insert(events)
    .values({
      workspaceId,
      type: event.type,
      source: event.source,
      label: event.label,
      payload: event.payload ?? {},
      dueAt: event.dueAt,
      idempotencyKey: event.idempotencyKey,
      status: "scheduled",
    })
    .onConflictDoNothing({ target: [events.workspaceId, events.idempotencyKey] })
    .returning();
  return row ?? null;
}

export async function nextDueEvent(db: Queryable, workspaceId: string, until: Date): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspaceId), eq(events.status, "scheduled"), lte(events.dueAt, until)))
    .orderBy(asc(events.dueAt), asc(events.id))
    .limit(1);
  return row ?? null;
}

/** The next scheduled event strictly after `after`, used by "Advance time". */
export async function nextScheduledAfter(db: Queryable, workspaceId: string, after: Date): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspaceId), eq(events.status, "scheduled"), gt(events.dueAt, after)))
    .orderBy(asc(events.dueAt), asc(events.id))
    .limit(1);
  return row ?? null;
}

export async function upcomingEvents(db: Queryable, workspaceId: string, limit = 6): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(and(eq(events.workspaceId, workspaceId), eq(events.status, "scheduled")))
    .orderBy(asc(events.dueAt), asc(events.id))
    .limit(limit);
}

export async function markEvent(
  db: Queryable,
  id: number,
  status: "processed" | "ignored" | "failed" | "cancelled",
  processedAt: Date,
  error?: string,
): Promise<void> {
  await db.update(events).set({ status, processedAt, error: error ?? null }).where(eq(events.id, id));
}

export async function rescheduleEvent(db: Queryable, id: number, dueAt: Date): Promise<void> {
  await db.update(events).set({ dueAt }).where(eq(events.id, id));
}
