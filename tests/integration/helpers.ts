import { and, asc, eq } from "drizzle-orm";
import { templateNarrator } from "@/agent/narration";
import type { AgentDeps } from "@/agent/orchestrator";
import { runUntil } from "@/agent/runtime";
import { atIst } from "@/domain/time";
import type { Db } from "@/lib/db/client";
import { activities, approvals, events, followUps, itTickets, tasks, toolCalls } from "@/lib/db/schema";
import { fixtureReader } from "@/services/documents/reader";
import type { ActionDeps } from "@/services/employee-actions";
import { confirmDocumentField, setEmergencyContact, submitForms, uploadSampleDocument } from "@/services/employee-actions";

export const ANAND = "anand.mehta";
export const deps: AgentDeps & ActionDeps = { narrator: templateNarrator, reader: fixtureReader };

export async function taskByKey(db: Db, ws: string, key: string) {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, ws), eq(tasks.id, `${ANAND}/${key}`)));
  if (!row) throw new Error(`no task ${key}`);
  return row;
}

export async function completeDocumentsChapter(db: Db, ws: string) {
  await uploadSampleDocument(db, ws, ANAND, "electricity-bill", deps);
  await confirmDocumentField(db, ws, ANAND, "relieving_letter", "2026-10-16", deps);
  await setEmergencyContact(db, ws, ANAND, "Kavya Mehta · +91 98200 11223");
  await submitForms(db, ws, ANAND, deps);
}

export async function toThursdayMorning(db: Db, ws: string) {
  await completeDocumentsChapter(db, ws);
  await runUntil(db, ws, atIst("2026-10-15", "09:00"), deps);
}

export async function toolLog(db: Db, ws: string) {
  return db.select().from(toolCalls).where(eq(toolCalls.workspaceId, ws)).orderBy(asc(toolCalls.id));
}

export async function activityLog(db: Db, ws: string) {
  return db.select().from(activities).where(eq(activities.workspaceId, ws)).orderBy(asc(activities.id));
}

export async function followUpRows(db: Db, ws: string) {
  return db.select().from(followUps).where(eq(followUps.workspaceId, ws));
}

export async function approvalRows(db: Db, ws: string) {
  return db.select().from(approvals).where(and(eq(approvals.workspaceId, ws), eq(approvals.employeeId, ANAND)));
}

export async function ticketRows(db: Db, ws: string) {
  return db.select().from(itTickets).where(eq(itTickets.workspaceId, ws));
}

export async function failedEvents(db: Db, ws: string) {
  return db.select().from(events).where(and(eq(events.workspaceId, ws), eq(events.status, "failed")));
}
