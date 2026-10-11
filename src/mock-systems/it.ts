/**
 * Mock IT service desk. Tickets get an expected completion from the IT provisioning
 * policy (Sections 5.1–5.4) and a scheduled "ready" event. The demo can inject a delay.
 */
import { and, eq } from "drizzle-orm";
import { addMinutes, addWorkingDays, atIst, dateKeyOf, leadTimeFinishDay } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { events, itTickets } from "@/lib/db/schema";
import { enqueueEvent } from "@/services/events/queue";
import { nextCounter } from "@/services/onboarding-state/repository";

export type ItTicketRow = typeof itTickets.$inferSelect;
export type ItTicketType = ItTicketRow["type"];

const LEAD_DAYS: Record<string, number> = { laptop: 2, email: 1, tool_access: 3 };
/** Time of day IT usually finishes each kind of work on its last lead day. */
const READY_TIME: Record<string, string> = { laptop: "10:05", email: "15:00", tool_access: "16:00" };

export function expectedReadyAt(type: ItTicketType, requestedAt: Date, day1Start: Date): Date {
  switch (type) {
    case "vpn":
      return addMinutes(requestedAt, 5);
    case "access":
      // Accounts are switched on at 09:00 on Day 1 (Section 5.2), or right away after Day 1 starts.
      return requestedAt.getTime() > day1Start.getTime() ? addMinutes(requestedAt, 5) : day1Start;
    case "loaner":
      // Loaners come from stock: ready at 16:00 on the first working day the request counts for.
      return requestedAt.getTime() > day1Start.getTime() ? addMinutes(requestedAt, 30) : atIst(leadTimeFinishDay(requestedAt, 1), "16:00");
    default: {
      const finishDay = leadTimeFinishDay(requestedAt, LEAD_DAYS[type] ?? 1);
      return atIst(finishDay, READY_TIME[type] ?? "12:00");
    }
  }
}

export async function createItTicket(
  db: Queryable,
  workspaceId: string,
  input: { employeeId: string; type: ItTicketType; detail: string; now: Date; day1Start: Date; delayed?: boolean },
): Promise<ItTicketRow> {
  const number = await nextCounter(db, workspaceId, "it_ticket");
  let expectedAt = expectedReadyAt(input.type, input.now, input.day1Start);
  if (input.delayed && input.type === "laptop") expectedAt = delayByWorkingDays(expectedAt, 2);
  const [row] = await db
    .insert(itTickets)
    .values({
      workspaceId,
      id: `IT-${number}`,
      employeeId: input.employeeId,
      type: input.type,
      status: "in_progress",
      detail: input.detail,
      createdAt: input.now,
      expectedAt,
    })
    .returning();
  if (!row) throw new Error("Could not create IT ticket");
  await enqueueEvent(db, workspaceId, {
    type: "it.ticket_ready",
    source: "it",
    label: `IT completes ${row.id} (${input.detail})`,
    dueAt: expectedAt,
    payload: { employeeId: input.employeeId, ticketId: row.id },
    idempotencyKey: `it.ticket_ready:${row.id}`,
  });
  return row;
}

function delayByWorkingDays(date: Date, days: number): Date {
  const key = addWorkingDays(dateKeyOf(date), days);
  return atIst(key, "10:05");
}

export async function getItTicket(db: Queryable, workspaceId: string, id: string): Promise<ItTicketRow | null> {
  const [row] = await db.select().from(itTickets).where(and(eq(itTickets.workspaceId, workspaceId), eq(itTickets.id, id)));
  return row ?? null;
}

export async function listItTickets(db: Queryable, workspaceId: string, employeeId: string): Promise<ItTicketRow[]> {
  return db.select().from(itTickets).where(and(eq(itTickets.workspaceId, workspaceId), eq(itTickets.employeeId, employeeId)));
}

export async function markTicketReady(db: Queryable, workspaceId: string, id: string, at: Date): Promise<void> {
  await db
    .update(itTickets)
    .set({ status: "ready", readyAt: at })
    .where(and(eq(itTickets.workspaceId, workspaceId), eq(itTickets.id, id)));
}

/**
 * Demo control: IT reports that an open laptop ticket will be 2 working days late.
 * Moves the scheduled ready event and returns the new ETA, or null when nothing is open.
 */
export async function delayLaptopTicket(db: Queryable, workspaceId: string, employeeId: string, now: Date): Promise<ItTicketRow | null> {
  const tickets = await listItTickets(db, workspaceId, employeeId);
  const ticket = tickets.find((t) => t.type === "laptop" && t.status === "in_progress");
  if (!ticket) return null;
  const expectedAt = delayByWorkingDays(ticket.expectedAt, 2);
  const [updated] = await db
    .update(itTickets)
    .set({ expectedAt })
    .where(and(eq(itTickets.workspaceId, workspaceId), eq(itTickets.id, ticket.id)))
    .returning();
  await db
    .update(events)
    .set({ dueAt: expectedAt })
    .where(and(eq(events.workspaceId, workspaceId), eq(events.idempotencyKey, `it.ticket_ready:${ticket.id}`), eq(events.status, "scheduled")));
  await enqueueEvent(db, workspaceId, {
    type: "it.ticket_delayed",
    source: "it",
    label: `IT delays ${ticket.id}`,
    dueAt: now,
    payload: { employeeId, ticketId: ticket.id },
    idempotencyKey: `it.ticket_delayed:${ticket.id}:${expectedAt.toISOString()}`,
  });
  return updated ?? null;
}
