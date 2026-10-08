/**
 * Things the joiner (or HR, from the console) does in the app. Each action changes state
 * through the domain rules, then queues an event so Navo reacts in the same request.
 */
import { and, eq } from "drizzle-orm";
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import { taskId as buildTaskId } from "@/content/seed/onboarding-template";
import { TIMELINE } from "@/content/timeline";
import { addMinutes } from "@/domain/time";
import type { Db, Queryable } from "@/lib/db/client";
import { approvals, benefitEnrollments, calendarEvents, documents, formFields, pulseResponses, tasks } from "@/lib/db/schema";
import { completeCourse } from "@/mock-systems/learning";
import { markItemsCollected } from "@/mock-systems/vendor-facilities";
import { enqueueEvent } from "@/services/events/queue";
import { getEmployee, getTask, listPeople, markDependenciesSatisfied, updateTask } from "@/services/onboarding-state/repository";
import { requireWorkspace } from "@/services/workspace";
import { lockWorkspace, processDue } from "@/agent/runtime";
import type { AgentDeps } from "@/agent/orchestrator";
import type { DocumentReader } from "./documents/reader";
import { displayDate, field, verifyAddressProof, verifyRelievingLetter } from "./documents/verify";

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export interface ActionDeps extends AgentDeps {
  reader: DocumentReader;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Run an action atomically, queue the follow-up event, then let Navo process it now. */
async function act(
  db: Db,
  workspaceId: string,
  deps: AgentDeps,
  label: string,
  body: (tx: Tx, now: Date) => Promise<{ action: string; employeeId: string; extra?: Record<string, unknown>; eventType?: string } | null>,
): Promise<void> {
  const now = await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const workspace = await requireWorkspace(tx, workspaceId);
    const result = await body(tx, workspace.simNow);
    if (result) {
      await enqueueEvent(tx, workspaceId, {
        type: result.eventType ?? "employee.action",
        source: "employee",
        label,
        dueAt: workspace.simNow,
        payload: { employeeId: result.employeeId, action: result.action, ...result.extra },
        idempotencyKey: `${result.eventType ?? "employee.action"}:${result.action}:${workspace.simNow.toISOString()}:${crypto.randomUUID()}`,
      });
    }
    return workspace.simNow;
  });
  await processDue(db, workspaceId, now, deps);
}

async function completeEmployeeTask(tx: Queryable, workspaceId: string, employeeId: string, key: Parameters<typeof buildTaskId>[1], at: Date, note: string) {
  const task = await getTask(tx, workspaceId, buildTaskId(employeeId, key));
  if (task.status === "completed") return false;
  if (task.status === "blocked") throw new ActionError(`${task.name} isn't ready yet`);
  await updateTask(tx, task, { status: "completed", statusNote: note }, { actor: employeeId, at, reason: "Done by the joiner" });
  await markDependenciesSatisfied(tx, workspaceId, task.id);
  return true;
}

/* ---------------- Documents and forms ---------------- */

export async function uploadSampleDocument(db: Db, workspaceId: string, employeeId: string, sampleId: string, deps: ActionDeps): Promise<void> {
  const sample = SAMPLE_DOCUMENTS.find((s) => s.id === sampleId);
  if (!sample) throw new ActionError(`Unknown sample document ${sampleId}`);
  // Read outside the transaction: reading may call Claude and take a few seconds.
  const reading = await deps.reader.read(sample, { db, workspaceId });
  await act(db, workspaceId, deps, `Uploaded ${sample.label}`, async (tx, now) => {
    const employee = await getEmployee(tx, workspaceId, employeeId);
    const people = await listPeople(tx, workspaceId);
    const name = people.get(employeeId)?.name ?? employeeId;
    const docId = `${employeeId}/${sample.documentType}`;
    const verdict =
      sample.documentType === "address_proof"
        ? verifyAddressProof(reading.fields, name)
        : verifyRelievingLetter(reading.fields, { notBefore: TIMELINE.offerAccepted, before: employee.joiningDate });
    await tx
      .update(documents)
      .set({
        status: verdict.status,
        note: verdict.note,
        extracted: reading.fields,
        readBy: reading.readBy,
        sampleId,
        uploadedAt: now,
        verifiedAt: verdict.status === "verified" ? now : null,
      })
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, docId)));
    if (sample.documentType === "address_proof" && verdict.status === "verified") {
      const address = field(reading.fields, "address")?.value ?? null;
      await tx
        .update(formFields)
        .set({ value: address, source: "From address proof" })
        .where(and(eq(formFields.workspaceId, workspaceId), eq(formFields.employeeId, employeeId), eq(formFields.label, "Address")));
    }
    return { action: "documents_updated", employeeId, extra: { documentType: sample.documentType, verdict: verdict.status } };
  });
}

/** The joiner confirms the one field Navo couldn't read. */
export async function confirmDocumentField(
  db: Db,
  workspaceId: string,
  employeeId: string,
  documentType: string,
  value: string,
  deps: AgentDeps,
): Promise<void> {
  await act(db, workspaceId, deps, "Confirmed relieving date", async (tx, now) => {
    const docId = `${employeeId}/${documentType}`;
    const [doc] = await tx.select().from(documents).where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, docId)));
    if (!doc) throw new ActionError("Document not found");
    if (doc.status !== "clarify") return null;
    const fields = doc.extracted.map((f) => (f.name === "last_working_day" ? { ...f, value, confidence: 1 } : f));
    await tx
      .update(documents)
      .set({ status: "verified", note: `Last day ${displayDate(value).split(" ").slice(0, 2).join(" ")} confirmed`, extracted: fields, verifiedAt: now })
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, docId)));
    return { action: "documents_updated", employeeId, extra: { documentType, verdict: "verified" } };
  });
}

export async function setEmergencyContact(db: Db, workspaceId: string, employeeId: string, value: string): Promise<void> {
  if (value.trim().length < 5) throw new ActionError("Add a name and phone number");
  await db
    .update(formFields)
    .set({ value: value.trim(), status: "provided", source: "Added by you" })
    .where(and(eq(formFields.workspaceId, workspaceId), eq(formFields.employeeId, employeeId), eq(formFields.label, "Emergency contact")));
}

export async function submitForms(db: Db, workspaceId: string, employeeId: string, deps: AgentDeps): Promise<void> {
  await act(db, workspaceId, deps, "Submitted forms", async (tx, now) => {
    const fields = await tx
      .select()
      .from(formFields)
      .where(and(eq(formFields.workspaceId, workspaceId), eq(formFields.employeeId, employeeId)));
    const missing = fields.filter((f) => f.status === "needs_employee" || !f.value);
    if (missing.length) throw new ActionError(`Still needed: ${missing.map((f) => f.label).join(", ")}`);
    const changed = await completeEmployeeTask(tx, workspaceId, employeeId, "forms", now, "Submitted");
    return changed ? { action: "forms_submitted", employeeId } : null;
  });
}

/* ---------------- Pre-joining and Day 1 ---------------- */

export async function completeTraining(db: Db, workspaceId: string, employeeId: string, deps: AgentDeps): Promise<void> {
  await act(db, workspaceId, deps, "Completed security training", async (tx, now) => {
    await completeCourse(tx, workspaceId, employeeId, now);
    const changed = await completeEmployeeTask(tx, workspaceId, employeeId, "security_training", now, "Done");
    return changed ? { action: "training_completed", employeeId } : null;
  });
}

export async function decideApproval(
  db: Db,
  workspaceId: string,
  employeeId: string,
  approvalId: string,
  decision: "approved" | "declined",
  deps: AgentDeps,
): Promise<void> {
  await act(db, workspaceId, deps, decision === "approved" ? "Approved loaner laptop" : "Declined loaner laptop", async (tx, now) => {
    const [row] = await tx
      .update(approvals)
      .set({ status: decision, decidedAt: now })
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.id, approvalId), eq(approvals.status, "pending")))
      .returning();
    if (!row) return null; // already decided: a double tap changes nothing
    return { action: "approval", employeeId, eventType: "employee.approval_decided", extra: { approvalId, decision } };
  });
}

export const PICKUP_ITEMS = ["id", "laptop", "kit"] as const;
export type PickupItem = (typeof PICKUP_ITEMS)[number];

export async function confirmPickup(db: Db, workspaceId: string, employeeId: string, collected: PickupItem[], deps: AgentDeps): Promise<void> {
  const items = PICKUP_ITEMS.filter((item) => collected.includes(item));
  if (items.length === 0) throw new ActionError("Tap what you collected");
  await act(db, workspaceId, deps, "Confirmed Day 1 pickup", async (tx, now) => {
    if (items.includes("kit")) await markItemsCollected(tx, workspaceId, employeeId);
    const changed = await completeEmployeeTask(tx, workspaceId, employeeId, "day1_collect", now, `Collected ${items.length} of ${PICKUP_ITEMS.length}`);
    if (!changed) return null;
    // Keep which items were collected, so Navo and the app can follow up on the rest.
    await tx
      .update(tasks)
      .set({ evidence: items.map((item) => `collected:${item}`) })
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, buildTaskId(employeeId, "day1_collect"))));
    return { action: "pickup_confirmed", employeeId, extra: { collected: items } };
  });
}

export async function enrolBenefits(db: Db, workspaceId: string, employeeId: string, deps: AgentDeps): Promise<void> {
  await act(db, workspaceId, deps, "Enrolled in health cover", async (tx, now) => {
    await tx
      .insert(benefitEnrollments)
      .values({
        workspaceId,
        id: `${employeeId}/health`,
        employeeId,
        plan: "Health cover",
        coverage: ["Employee", "Spouse", "1 child"],
        status: "enrolled",
        deadline: addMinutes(now, 0),
        enrolledAt: now,
      })
      .onConflictDoNothing();
    const changed = await completeEmployeeTask(tx, workspaceId, employeeId, "benefits_enrolment", now, "Enrolled");
    return changed ? { action: "benefits_enrolled", employeeId } : null;
  });
}

/** The joiner accepts Navo's suggestion of a roadmap walkthrough with their buddy. */
export async function bookWalkthrough(db: Db, workspaceId: string, employeeId: string, deps: AgentDeps): Promise<void> {
  await act(db, workspaceId, deps, "Asked Navo to book a walkthrough", async (tx) => {
    const existing = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.workspaceId, workspaceId), eq(calendarEvents.employeeId, employeeId), eq(calendarEvents.kind, "walkthrough")));
    if (existing.length) return null;
    return { action: "walkthrough_requested", employeeId };
  });
}

export async function recordPulse(db: Db, workspaceId: string, employeeId: string, score: number): Promise<void> {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new ActionError("Score must be 1 to 5");
  const workspace = await requireWorkspace(db, workspaceId);
  await db.insert(pulseResponses).values({ workspaceId, employeeId, score, at: workspace.simNow });
}

/* ---------------- HR console ---------------- */

/** Priya generates the Employee ID in the HR system; Navo hears about it like any HR event. */
export async function hrGenerateEmployeeId(db: Db, workspaceId: string, employeeId: string, deps: AgentDeps): Promise<void> {
  const now = await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const workspace = await requireWorkspace(tx, workspaceId);
    await enqueueEvent(tx, workspaceId, {
      type: "hr.employee_id_issued",
      source: "hr",
      label: "Priya generates Employee ID",
      dueAt: workspace.simNow,
      payload: { employeeId, employeeNumber: "EMP-204817", issuedBy: "priya.nair" },
      idempotencyKey: `hr.employee_id_issued:${employeeId}:console`,
    });
    return workspace.simNow;
  });
  await processDue(db, workspaceId, now, deps);
}
