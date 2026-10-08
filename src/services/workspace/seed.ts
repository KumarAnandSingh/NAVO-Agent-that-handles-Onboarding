import { COMPANY, SEED_VERSION } from "@/content/company";
import { FEATURED_DOCUMENTS, FEATURED_FORM_FIELDS } from "@/content/seed/documents";
import {
  DEPENDENCY_TEMPLATE,
  ONBOARDING_TEMPLATE,
  taskId,
  type TaskKey,
  type TaskTemplate,
} from "@/content/seed/onboarding-template";
import { JOINERS, STAFF, type JoinerSeed } from "@/content/seed/people";
import { TIMELINE, WORKSPACE_START } from "@/content/timeline";
import { addCalendarDays, atIst, nextWorkingTime } from "@/domain/time";
import type { OwnerType, ScenarioId, TaskStatus } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import {
  activities,
  approvals,
  calendarEvents,
  counters,
  dependencies,
  documents,
  employees,
  events,
  facilitiesItems,
  formFields,
  people,
  tasks,
  vendorChecks,
  workspaces,
} from "@/lib/db/schema";

export { WORKSPACE_START };

interface TaskState {
  status: TaskStatus;
  note?: string;
  completedAt?: Date;
  dueAt?: Date;
}

type StateMap = Partial<Record<TaskKey, TaskState>>;

const done = (date: string, time = "10:00", note?: string): TaskState => ({
  status: "completed",
  completedAt: atIst(date, time),
  note,
});

/** Initial task states per joiner profile. Unlisted tasks start blocked or pending. */
function profileStates(joiner: JoinerSeed): StateMap {
  const day1 = atIst(joiner.joiningDate, "09:00");
  switch (joiner.profile) {
    case "featured":
      return {
        offer_accept: done(TIMELINE.offerAccepted, "10:05"),
        documents: { status: "needs_user", note: "2 pending · Navo read the rest" },
        background_check: { status: "in_progress", note: "With vendor", dueAt: atIst("2026-10-16", "18:00") },
        onboarding_kit: { status: "in_progress", note: "Facilities preparing", dueAt: day1 },
        benefits_enrolment: { status: "pending", note: "Opens on Day 1", dueAt: atIst(addCalendarDays(joiner.joiningDate, 7), "18:00") },
      };
    case "on_track":
    case "bgv_late":
      return {
        offer_accept: done("2026-09-28"),
        documents: done("2026-09-30"),
        forms: done("2026-09-30", "11:00"),
        background_check:
          joiner.profile === "bgv_late"
            ? { status: "in_progress", note: "Past SLA · vendor chased twice", dueAt: atIst("2026-10-13", "18:00") }
            : done("2026-10-08"),
        employee_id: done("2026-10-05", "15:00"),
        email: { status: "in_progress", note: "IT · live on Day 1" },
        laptop: { status: "in_progress", note: "IT · imaging" },
        id_card: { status: "in_progress", note: "HR · printing" },
        manager_1on1: done("2026-10-01"),
        induction: done("2026-10-01"),
        security_training: { status: "needs_user", note: "Due before Day 1" },
      };
    case "docs_pending":
      return {
        offer_accept: done("2026-10-02"),
        documents: { status: "needs_user", note: "Relieving letter unclear" },
      };
    case "early":
      return {
        offer_accept: done("2026-10-05"),
        documents: { status: "needs_user", note: "Not started" },
      };
  }
}

function defaultStatus(template: TaskTemplate, states: StateMap): TaskStatus {
  const hasBlockingPrerequisite = DEPENDENCY_TEMPLATE.some(
    (dep) => dep.dependent === template.key && dep.type === "blocks" && states[dep.prerequisite]?.status !== "completed",
  );
  return hasBlockingPrerequisite ? "blocked" : "pending";
}

const BLOCKED_NOTES: Partial<Record<TaskKey, string>> = {
  forms: "After documents",
  employee_id: "Needs documents",
  laptop: "Needs Employee ID",
  email: "Needs Employee ID",
  id_card: "Needs Employee ID",
  vpn: "Needs laptop",
  manager_1on1: "Booked once documents are in",
  buddy: "Matched once documents are in",
  induction: "Booked once documents are in",
  security_training: "Enrolled once documents are in",
  access_activation: "Needs training, email and VPN",
  pickup: "Needs ID card, laptop and kit",
};

function ownerIdFor(ownerType: OwnerType, joiner: JoinerSeed): string | null {
  switch (ownerType) {
    case "employee":
      return joiner.id;
    case "manager":
      return joiner.managerId;
    case "buddy":
      return joiner.buddyId;
    case "hr":
      return "priya.nair";
    case "hr_ops":
      return "neha.kapoor";
    case "it":
      return "it.desk";
    case "facilities":
      return "facilities.desk";
    case "vendor":
      return "trustcheck";
    case "navo":
      return null;
  }
}

export interface SeedOptions {
  workspaceId: string;
  scenario: ScenarioId;
}

/** Create a fresh workspace with the full synthetic Halden dataset. */
export async function seedWorkspace(db: Queryable, { workspaceId, scenario }: SeedOptions): Promise<void> {
  const now = WORKSPACE_START;
  await db.insert(workspaces).values({ id: workspaceId, scenario, simNow: now, seedVersion: SEED_VERSION });

  const allPeople = [...STAFF, ...JOINERS];
  await db.insert(people).values(
    allPeople.map((p) => ({
      workspaceId,
      id: p.id,
      name: p.name,
      title: p.title,
      kind: p.kind,
      team: p.team ?? null,
      email: `${p.id}@${COMPANY.emailDomain}`,
    })),
  );

  await db.insert(employees).values(
    JOINERS.map((j) => ({
      workspaceId,
      personId: j.id,
      role: j.role,
      department: j.department,
      managerId: j.managerId,
      buddyId: j.buddyId,
      hrOwnerId: "priya.nair",
      location: j.location,
      workMode: j.workMode,
      joiningDate: j.joiningDate,
      employmentStatus: "pre_joining" as const,
      employeeNumber: j.profile === "on_track" || j.profile === "bgv_late" ? `EMP-2047${j.id.length}0` : null,
      homeArea: j.homeArea ?? null,
      family: j.family ?? null,
      featured: j.featured ?? false,
      simulated: j.featured ?? false,
    })),
  );

  const taskRows = [];
  const dependencyRows = [];
  for (const joiner of JOINERS) {
    const states = profileStates(joiner);
    const day1 = atIst(joiner.joiningDate, "09:00");
    for (const [index, template] of ONBOARDING_TEMPLATE.entries()) {
      const state = states[template.key];
      const status = state?.status ?? defaultStatus(template, states);
      taskRows.push({
        workspaceId,
        id: taskId(joiner.id, template.key),
        employeeId: joiner.id,
        key: template.key,
        name: template.name,
        description: template.description,
        phase: template.phase,
        ownerType: template.ownerType,
        ownerId: ownerIdFor(template.ownerType, joiner),
        status,
        dueAt: state?.dueAt ?? (template.requiredForDay1 ? day1 : null),
        leadWorkingDays: template.leadWorkingDays,
        requiredForDay1: template.requiredForDay1,
        watched: template.watched,
        statusNote: state?.note ?? (status === "blocked" ? (BLOCKED_NOTES[template.key] ?? null) : null),
        blockedReason: status === "blocked" ? (BLOCKED_NOTES[template.key] ?? "Waiting on a prerequisite") : null,
        completedAt: state?.completedAt ?? null,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const dep of DEPENDENCY_TEMPLATE) {
      const prerequisiteDone = states[dep.prerequisite]?.status === "completed";
      dependencyRows.push({
        workspaceId,
        id: `${joiner.id}/${dep.prerequisite}->${dep.dependent}`,
        prerequisiteTaskId: taskId(joiner.id, dep.prerequisite),
        dependentTaskId: taskId(joiner.id, dep.dependent),
        type: dep.type,
        status: prerequisiteDone ? ("satisfied" as const) : ("pending" as const),
      });
    }
  }
  await db.insert(tasks).values(taskRows);
  await db.insert(dependencies).values(dependencyRows);

  const featured = JOINERS.find((j) => j.featured);
  if (!featured) throw new Error("Seed data needs one featured joiner");

  await db.insert(documents).values(
    FEATURED_DOCUMENTS.map((doc, index) => ({
      workspaceId,
      id: `${featured.id}/${doc.type}`,
      employeeId: featured.id,
      type: doc.type,
      name: doc.name,
      status: doc.status,
      note: doc.note,
      maskedValue: doc.maskedValue ?? null,
      extracted: doc.extracted ?? [],
      readBy: doc.status === "needed" ? null : ("seed" as const),
      uploadedAt: doc.status === "needed" ? null : atIst(TIMELINE.offerAccepted, "11:30"),
      verifiedAt: doc.status === "verified" ? atIst(TIMELINE.offerAccepted, "11:32") : null,
      sortOrder: index,
    })),
  );

  await db.insert(formFields).values(
    FEATURED_FORM_FIELDS.map((field, index) => ({
      workspaceId,
      id: `${featured.id}/${field.form}/${index}`,
      employeeId: featured.id,
      form: field.form,
      label: field.label,
      value: field.value,
      source: field.source,
      status: field.status,
      sortOrder: index,
    })),
  );

  await db.insert(vendorChecks).values({
    workspaceId,
    id: `${featured.id}/bgv`,
    employeeId: featured.id,
    type: "background_verification",
    status: "in_progress",
    expectedAt: atIst("2026-10-16", "08:40"),
  });

  await db.insert(facilitiesItems).values({
    workspaceId,
    id: `${featured.id}/kit`,
    employeeId: featured.id,
    item: "Onboarding kit",
    status: "preparing",
    location: COMPANY.pickupSite,
  });

  // The team calendar already has a planning session in Anand's first week.
  await db.insert(calendarEvents).values({
    workspaceId,
    id: "CAL-TEAM-1",
    employeeId: featured.id,
    kind: "team_planning",
    title: "Product team planning",
    startsAt: atIst("2026-10-23", "11:00"),
    endsAt: atIst("2026-10-23", "12:00"),
    location: "Room 4A",
    withPersonId: featured.managerId,
    ownerType: "manager",
  });

  // Exceptions already waiting for HR on background joiners (static sample data).
  await db.insert(approvals).values([
    {
      workspaceId,
      id: "HRD-7",
      employeeId: "priya.sharma",
      action: "decide_start_date",
      requestedFrom: "priya.nair",
      title: "Background check past SLA",
      detail: "starts 26 Oct",
      reason: "chased vendor twice, recommends limited-access start",
      status: "pending",
      createdAt: atIst("2026-10-07", "16:10"),
    },
    {
      workspaceId,
      id: "HRD-8",
      employeeId: "karan.gupta",
      action: "review_document",
      requestedFrom: "priya.nair",
      title: "Relieving letter unclear",
      detail: "last working date unreadable",
      reason: "asked Karan to re-upload, needs your waiver if not by Fri",
      status: "pending",
      createdAt: atIst("2026-10-07", "17:40"),
    },
  ]);

  await db.insert(activities).values([
    {
      workspaceId,
      employeeId: featured.id,
      caseKey: "docs",
      at: atIst(TIMELINE.offerAccepted, "11:32"),
      actor: "navo",
      phase: "Acted",
      summary: "Read PAN, Aadhaar and cancelled cheque from the application. Pre-filled payroll.",
      relatedTaskId: taskId(featured.id, "documents"),
    },
    {
      workspaceId,
      employeeId: featured.id,
      caseKey: "docs",
      at: atIst(TIMELINE.offerAccepted, "11:33"),
      actor: "navo",
      phase: "Noticed",
      summary: "Relieving letter: last working day unreadable. Address proof not uploaded.",
      relatedTaskId: taskId(featured.id, "documents"),
    },
  ]);

  // The world keeps moving without Navo: vendor and facilities updates are already scheduled.
  await db.insert(events).values([
    scheduled(workspaceId, "navo.daily_check", nextWorkingTime(now, "09:15"), "navo", "Navo daily check", { employeeId: featured.id }),
    scheduled(workspaceId, "vendor.check_cleared", atIst("2026-10-16", "08:40"), "vendor", "Vendor clears background check", {
      employeeId: featured.id,
      checkId: `${featured.id}/bgv`,
    }),
    scheduled(workspaceId, "facilities.item_ready", atIst("2026-10-16", "09:30"), "facilities", "Facilities prepares onboarding kit", {
      employeeId: featured.id,
      itemId: `${featured.id}/kit`,
    }),
  ]);

  await db.insert(counters).values(
    Object.entries({ approval: 0, reminder: 0, escalation: 0, it_ticket: 55230, hr_request: 1040, calendar: 0 }).map(
      ([name, value]) => ({ workspaceId, name, value }),
    ),
  );
}

function scheduled(
  workspaceId: string,
  type: string,
  dueAt: Date,
  source: string,
  label: string,
  payload: Record<string, unknown>,
) {
  return {
    workspaceId,
    type,
    dueAt,
    source,
    label,
    payload,
    status: "scheduled" as const,
    idempotencyKey: `${type}:${JSON.stringify(payload)}:${dueAt.toISOString()}`,
  };
}
