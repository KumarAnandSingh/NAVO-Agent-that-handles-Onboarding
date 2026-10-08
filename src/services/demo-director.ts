/**
 * Demo controls: reset, scenario switch, IT delay injection and chapter jumps. Jumps
 * replay the story through the real engine (not by writing end states), using the
 * deterministic reader and narrator so they are fast and identical every time.
 */
import { and, eq, max } from "drizzle-orm";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import { TIMELINE } from "@/content/timeline";
import { templateNarrator } from "@/agent/narration";
import { advance, processDue, runUntil, type ProcessedEvent } from "@/agent/runtime";
import { atIst } from "@/domain/time";
import type { ScenarioId } from "@/domain/types";
import type { Db } from "@/lib/db/client";
import { activities, approvals, tasks, workspaces } from "@/lib/db/schema";
import { delayLaptopTicket } from "@/mock-systems/it";
import { fixtureReader } from "@/services/documents/reader";
import {
  completeTraining,
  confirmDocumentField,
  confirmPickup,
  decideApproval,
  setEmergencyContact,
  submitForms,
  uploadSampleDocument,
  type ActionDeps,
} from "@/services/employee-actions";
import { requireWorkspace, resetWorkspace } from "@/services/workspace";

export const CHAPTERS = ["First launch", "Documents and forms", "Pre-joining: Navo at work", "Ready for Day 1", "Day 1", "Week 1 to Day 30"] as const;

const FAST: ActionDeps = { narrator: templateNarrator, reader: fixtureReader };
const ANAND = FEATURED_EMPLOYEE_ID;

export async function reset(db: Db, workspaceId: string, scenario?: ScenarioId): Promise<void> {
  const workspace = await requireWorkspace(db, workspaceId);
  await resetWorkspace(db, workspaceId, scenario ?? workspace.scenario);
}

/** Switch how HR behaves. Takes effect for reminders sent from now on. */
export async function setScenario(db: Db, workspaceId: string, scenario: ScenarioId): Promise<void> {
  await db.update(workspaces).set({ scenario }).where(eq(workspaces.id, workspaceId));
}

/** IT reports a two-working-day slip on the open laptop ticket (or on the next one raised). */
export async function injectItDelay(db: Db, workspaceId: string, deps: ActionDeps): Promise<boolean> {
  const workspace = await requireWorkspace(db, workspaceId);
  await db.update(workspaces).set({ flags: { ...workspace.flags, itDelay: true } }).where(eq(workspaces.id, workspaceId));
  const delayed = await delayLaptopTicket(db, workspaceId, ANAND, workspace.simNow);
  if (delayed) await processDue(db, workspaceId, workspace.simNow, deps);
  return delayed !== null;
}

async function taskStatus(db: Db, workspaceId: string, key: string): Promise<string | undefined> {
  const [row] = await db.select({ status: tasks.status }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, `${ANAND}/${key}`)));
  return row?.status;
}

async function approvePending(db: Db, workspaceId: string): Promise<void> {
  const pending = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.requestedFrom, ANAND), eq(approvals.status, "pending")));
  for (const approval of pending) await decideApproval(db, workspaceId, ANAND, approval.id, "approved", FAST);
}

async function documentsChapter(db: Db, workspaceId: string): Promise<void> {
  await uploadSampleDocument(db, workspaceId, ANAND, "electricity-bill", FAST);
  await confirmDocumentField(db, workspaceId, ANAND, "relieving_letter", "2026-10-16", FAST);
  await setEmergencyContact(db, workspaceId, ANAND, "Kavya Mehta · +91 00000 11223");
  await submitForms(db, workspaceId, ANAND, FAST);
}

/** Replay the story up to the start of a chapter (0–5) from a fresh workspace. */
export async function jumpToChapter(db: Db, workspaceId: string, chapter: number): Promise<void> {
  await reset(db, workspaceId);
  if (chapter < 2) return;
  await documentsChapter(db, workspaceId);
  await runUntil(db, workspaceId, atIst(TIMELINE.riskDay, "09:00"), FAST);
  if (chapter < 3) return;
  for (let i = 0; i < 40 && (await taskStatus(db, workspaceId, "pickup")) !== "completed"; i++) {
    await approvePending(db, workspaceId);
    await advance(db, workspaceId, FAST);
  }
  if (chapter < 4) return;
  await completeTraining(db, workspaceId, ANAND, FAST);
  await runUntil(db, workspaceId, atIst(TIMELINE.day1, "07:30"), FAST);
  if (chapter < 5) return;
  await runUntil(db, workspaceId, atIst(TIMELINE.day1, "11:40"), FAST);
  await confirmPickup(db, workspaceId, ANAND, ["id", "laptop", "kit"], FAST);
  await runUntil(db, workspaceId, atIst(TIMELINE.week1End, "09:00"), FAST);
}

/**
 * "Advance time" for the presenter: keep moving the clock event by event until something
 * the joiner would notice happens (a new activity in Navo's log), so quiet daily checks
 * don't need a click each. Every event still runs through the real engine.
 */
export async function advanceStory(db: Db, workspaceId: string, deps: ActionDeps, maxSteps = 12): Promise<ProcessedEvent[]> {
  const before = await latestActivityId(db, workspaceId);
  const processed: ProcessedEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const result = await advance(db, workspaceId, deps);
    processed.push(...result.processed);
    if (result.processed.length === 0) break;
    if ((await latestActivityId(db, workspaceId)) > before) break;
  }
  return processed;
}

async function latestActivityId(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ id: max(activities.id) })
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.employeeId, ANAND), eq(activities.userVisible, true)));
  return row?.id ?? 0;
}

/** Skip ahead to the 30-day mark. */
export async function jumpToDay30(db: Db, workspaceId: string): Promise<void> {
  const workspace = await requireWorkspace(db, workspaceId);
  if (workspace.simNow.getTime() < atIst(TIMELINE.week1End, "09:00").getTime()) await jumpToChapter(db, workspaceId, 5);
  await runUntil(db, workspaceId, atIst(TIMELINE.first30End, "09:00"), FAST);
}

export const SKIP_TARGETS = {
  day1: () => atIst(TIMELINE.day1, "07:30"),
  pickup: () => atIst(TIMELINE.day1, "11:15"),
  day1_end: () => atIst(TIMELINE.day1, "17:30"),
  week1: () => atIst(TIMELINE.week1End, "09:00"),
} as const;

/**
 * Move the clock forward to a story moment, keeping everything the presenter did so far
 * (unlike a chapter jump, which replays from a fresh workspace). Never moves backwards.
 */
export async function skipAhead(db: Db, workspaceId: string, to: keyof typeof SKIP_TARGETS): Promise<void> {
  const workspace = await requireWorkspace(db, workspaceId);
  const target = SKIP_TARGETS[to]();
  if (workspace.simNow.getTime() < target.getTime()) await runUntil(db, workspaceId, target, FAST);
}
