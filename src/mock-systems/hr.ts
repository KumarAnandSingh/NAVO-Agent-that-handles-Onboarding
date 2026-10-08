/**
 * Mock HR system. Requests behave like a real queue: HR works them on its own schedule.
 * The demo scenario decides how HR reacts to Navo's reminder: in "HR responds" the
 * onboarding partner issues the ID 86 minutes later; in "HR silent" nothing happens
 * until HR Operations is escalated to.
 */
import { and, eq } from "drizzle-orm";
import { addMinutes, atIst, leadTimeFinishDay } from "@/domain/time";
import type { ScenarioId } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import { hrRequests } from "@/lib/db/schema";
import { enqueueEvent } from "@/services/events/queue";
import { nextCounter } from "@/services/onboarding-state/repository";

export type HrRequestRow = typeof hrRequests.$inferSelect;

export const HR_RESPONSE_MINUTES = 86;
export const HR_OPS_RESPONSE_MINUTES = 92;
export const ISSUED_EMPLOYEE_NUMBER = "EMP-204817";

export async function createHrRequest(
  db: Queryable,
  workspaceId: string,
  input: { employeeId: string; type: "employee_id" | "id_card"; now: Date; dueAt: Date | null; note: string },
): Promise<HrRequestRow> {
  const number = await nextCounter(db, workspaceId, "hr_request");
  const [row] = await db
    .insert(hrRequests)
    .values({
      workspaceId,
      id: `HR-${number}`,
      employeeId: input.employeeId,
      type: input.type,
      status: "open",
      assigneeId: "priya.nair",
      note: input.note,
      createdAt: input.now,
      dueAt: input.dueAt,
    })
    .returning();
  if (!row) throw new Error("Could not create HR request");

  if (input.type === "id_card") {
    // ID cards print at 16:00 on the first working day the request counts for.
    const printedAt = atIst(leadTimeFinishDay(input.now, 1), "16:00");
    await enqueueEvent(db, workspaceId, {
      type: "hr.id_card_printed",
      source: "hr",
      label: "HR prints ID card",
      dueAt: printedAt,
      payload: { employeeId: input.employeeId, requestId: row.id },
      idempotencyKey: `hr.id_card_printed:${row.id}`,
    });
  }
  return row;
}

export async function findOpenHrRequest(
  db: Queryable,
  workspaceId: string,
  employeeId: string,
  type: "employee_id" | "id_card",
): Promise<HrRequestRow | null> {
  const rows = await db
    .select()
    .from(hrRequests)
    .where(and(eq(hrRequests.workspaceId, workspaceId), eq(hrRequests.employeeId, employeeId), eq(hrRequests.type, type)));
  return rows.find((r) => r.status !== "done") ?? null;
}

/** HR reacts to a reminder according to the demo scenario. */
export async function receiveReminder(
  db: Queryable,
  workspaceId: string,
  scenario: ScenarioId,
  input: { employeeId: string; reminderId: string; sentAt: Date },
): Promise<void> {
  if (scenario !== "hr_responds") return;
  await scheduleIdIssue(db, workspaceId, input.employeeId, addMinutes(input.sentAt, HR_RESPONSE_MINUTES), "priya.nair", input.reminderId);
}

/** HR Operations always acts on an escalation. */
export async function receiveEscalation(
  db: Queryable,
  workspaceId: string,
  input: { employeeId: string; escalationId: string; sentAt: Date },
): Promise<void> {
  await scheduleIdIssue(db, workspaceId, input.employeeId, addMinutes(input.sentAt, HR_OPS_RESPONSE_MINUTES), "neha.kapoor", input.escalationId);
}

async function scheduleIdIssue(db: Queryable, workspaceId: string, employeeId: string, dueAt: Date, issuedBy: string, cause: string) {
  await enqueueEvent(db, workspaceId, {
    type: "hr.employee_id_issued",
    source: "hr",
    label: issuedBy === "neha.kapoor" ? "HR Ops issues Employee ID" : "HR issues Employee ID",
    dueAt,
    payload: { employeeId, employeeNumber: ISSUED_EMPLOYEE_NUMBER, issuedBy },
    idempotencyKey: `hr.employee_id_issued:${employeeId}:${cause}`,
  });
}

/** Mark an HR request done in the HR system (the agent then reacts to the event). */
export async function completeHrRequest(db: Queryable, workspaceId: string, requestId: string, at: Date, externalRef?: string): Promise<void> {
  await db
    .update(hrRequests)
    .set({ status: "done", resolvedAt: at, externalRef: externalRef ?? null })
    .where(and(eq(hrRequests.workspaceId, workspaceId), eq(hrRequests.id, requestId)));
}
