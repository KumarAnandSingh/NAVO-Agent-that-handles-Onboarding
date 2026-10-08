/** Mock calendar. Booked sessions linked to a task close that task when they end. */
import { and, asc, eq } from "drizzle-orm";
import type { OwnerType } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import { calendarEvents } from "@/lib/db/schema";
import { enqueueEvent } from "@/services/events/queue";
import { nextCounter } from "@/services/onboarding-state/repository";

export type CalendarEventRow = typeof calendarEvents.$inferSelect;

export interface NewCalendarEvent {
  employeeId: string;
  kind: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  withPersonId?: string | null;
  ownerType: OwnerType;
  /** Task completed automatically when the session ends. */
  taskId?: string | null;
}

export async function bookEvent(db: Queryable, workspaceId: string, input: NewCalendarEvent): Promise<CalendarEventRow> {
  const number = await nextCounter(db, workspaceId, "calendar");
  const [row] = await db
    .insert(calendarEvents)
    .values({
      workspaceId,
      id: `CAL-${number}`,
      employeeId: input.employeeId,
      kind: input.kind,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withPersonId: input.withPersonId ?? null,
      ownerType: input.ownerType,
      taskId: input.taskId ?? null,
    })
    .returning();
  if (!row) throw new Error("Could not book calendar event");
  if (row.taskId) {
    await enqueueEvent(db, workspaceId, {
      type: "calendar.event_ended",
      source: "calendar",
      label: `${row.title} ends`,
      dueAt: row.endsAt,
      payload: { employeeId: input.employeeId, calendarEventId: row.id, taskId: row.taskId },
      idempotencyKey: `calendar.event_ended:${row.id}`,
    });
  }
  return row;
}

export async function listEvents(db: Queryable, workspaceId: string, employeeId: string): Promise<CalendarEventRow[]> {
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.workspaceId, workspaceId), eq(calendarEvents.employeeId, employeeId)))
    .orderBy(asc(calendarEvents.startsAt));
}

/** Free slots for a person on a day (mock: anyone is free unless they have a booking). */
export async function isFree(db: Queryable, workspaceId: string, employeeId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
  const events = await listEvents(db, workspaceId, employeeId);
  return events.every((e) => e.endsAt.getTime() <= startsAt.getTime() || e.startsAt.getTime() >= endsAt.getTime());
}
