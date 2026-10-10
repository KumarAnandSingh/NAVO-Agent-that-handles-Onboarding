/**
 * Postgres schema (Drizzle). The same schema runs on embedded PGlite (local dev, tests)
 * and on Neon (hosted demo). Every demo visitor gets an isolated workspace; all
 * workspace-scoped rows cascade-delete with their workspace, which is how Reset works.
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ActivityPhase,
  DependencyType,
  Guard,
  OwnerType,
  Phase,
  RiskLevel,
  ScenarioId,
  TaskStatus,
} from "@/domain/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  scenario: text("scenario").$type<ScenarioId>().notNull(),
  simNow: ts("sim_now").notNull(),
  /** Real wall-clock creation time, used to clean up abandoned demo workspaces. */
  createdAt: ts("created_at").notNull().defaultNow(),
  seedVersion: integer("seed_version").notNull(),
  /** Free-form demo flags, e.g. { itDelay: true }. */
  flags: jsonb("flags").$type<Record<string, boolean>>().notNull().default({}),
});

const workspaceRef = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

export const people = pgTable(
  "people",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<OwnerType | "joiner">().notNull(),
    email: text("email").notNull(),
    team: text("team"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export interface FamilyDetails {
  maritalStatus: "single" | "married";
  children: number;
  spouseName?: string;
}

export const employees = pgTable(
  "employees",
  {
    workspaceId: workspaceRef(),
    personId: text("person_id").notNull(),
    role: text("role").notNull(),
    department: text("department").notNull(),
    managerId: text("manager_id").notNull(),
    buddyId: text("buddy_id"),
    hrOwnerId: text("hr_owner_id").notNull(),
    location: text("location").notNull(),
    workMode: text("work_mode").$type<"hybrid" | "office" | "remote">().notNull(),
    /** Calendar date of Day 1 (YYYY-MM-DD, Asia/Kolkata). */
    joiningDate: text("joining_date").notNull(),
    employmentStatus: text("employment_status")
      .$type<"offer_accepted" | "pre_joining" | "active">()
      .notNull(),
    employeeNumber: text("employee_number"),
    homeArea: text("home_area"),
    family: jsonb("family").$type<FamilyDetails>(),
    /** Latest Day-1 risk computed by the risk engine. */
    day1Risk: text("day1_risk").$type<RiskLevel>().notNull().default("none"),
    /** True for the featured joiner whose phone is shown in the demo. */
    featured: boolean("featured").notNull().default(false),
    /**
     * Joiners the agent actively simulates. Background joiners are static sample data
     * for the HR console; the engine itself is per-employee and works for any of them.
     */
    simulated: boolean("simulated").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.personId] }),
    foreignKey({ columns: [t.workspaceId, t.personId], foreignColumns: [people.workspaceId, people.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    phase: text("phase").$type<Phase>().notNull(),
    ownerType: text("owner_type").$type<OwnerType>().notNull(),
    ownerId: text("owner_id"),
    status: text("status").$type<TaskStatus>().notNull(),
    priority: integer("priority").notNull().default(2),
    dueAt: ts("due_at"),
    leadWorkingDays: integer("lead_working_days").notNull().default(0),
    requiredForDay1: boolean("required_for_day1").notNull().default(false),
    /** Shown on the employee's home screen in the "Navo is watching" set. */
    watched: boolean("watched").notNull().default(false),
    blockedReason: text("blocked_reason"),
    nextAction: text("next_action"),
    /** Short human status line, e.g. "HR · due 14 Oct". */
    statusNote: text("status_note"),
    riskLevel: text("risk_level").$type<RiskLevel>().notNull().default("none"),
    riskReason: text("risk_reason"),
    sourceSystem: text("source_system").notNull().default("navo"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: ts("completed_at"),
    version: integer("version").notNull().default(1),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    index("tasks_employee_idx").on(t.workspaceId, t.employeeId),
  ],
);

export const dependencies = pgTable(
  "dependencies",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    prerequisiteTaskId: text("prerequisite_task_id").notNull(),
    dependentTaskId: text("dependent_task_id").notNull(),
    type: text("type").$type<DependencyType>().notNull().default("blocks"),
    status: text("status").$type<"pending" | "satisfied">().notNull().default("pending"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({
      columns: [t.workspaceId, t.prerequisiteTaskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.dependentTaskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
  ],
);

export const taskEvents = pgTable("task_events", {
  id: serial("id").primaryKey(),
  workspaceId: workspaceRef(),
  taskId: text("task_id").notNull(),
  fromStatus: text("from_status").$type<TaskStatus>(),
  toStatus: text("to_status").$type<TaskStatus>().notNull(),
  actor: text("actor").notNull(),
  reason: text("reason"),
  at: ts("at").notNull(),
  version: integer("version").notNull(),
});

export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
  /** Raw text as read, when it differs from the normalised value (e.g. "1? Oct 2026"). */
  raw?: string;
}

export const documents = pgTable(
  "documents",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    status: text("status")
      .$type<"needed" | "reading" | "verified" | "under_review" | "clarify" | "rejected">()
      .notNull(),
    note: text("note").notNull(),
    maskedValue: text("masked_value"),
    sampleId: text("sample_id"),
    extracted: jsonb("extracted").$type<ExtractedField[]>().notNull().default([]),
    readBy: text("read_by").$type<"claude" | "fixture" | "seed">(),
    uploadedAt: ts("uploaded_at"),
    verifiedAt: ts("verified_at"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const formFields = pgTable(
  "form_fields",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    form: text("form").notNull(),
    label: text("label").notNull(),
    value: text("value"),
    source: text("source").notNull(),
    status: text("status").$type<"prefilled" | "needs_employee" | "provided">().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const approvals = pgTable(
  "approvals",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requestedFrom: text("requested_from").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<"pending" | "approved" | "declined" | "expired">().notNull(),
    createdAt: ts("created_at").notNull(),
    decidedAt: ts("decided_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const followUps = pgTable(
  "follow_ups",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    taskId: text("task_id").notNull(),
    kind: text("kind").$type<"reminder" | "escalation">().notNull(),
    toPersonId: text("to_person_id").notNull(),
    ccPersonId: text("cc_person_id"),
    message: text("message").notNull(),
    sentAt: ts("sent_at").notNull(),
    slaDueAt: ts("sla_due_at").notNull(),
    status: text("status").$type<"open" | "resolved" | "breached">().notNull(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

/**
 * Event log and schedule in one table. Events due now are processed immediately;
 * future events (external system responses, SLA checks, daily checks) wait for the
 * simulated clock. The idempotency key makes duplicate deliveries harmless.
 */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    workspaceId: workspaceRef(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    source: text("source").notNull(),
    label: text("label").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    dueAt: ts("due_at").notNull(),
    status: text("status").$type<"scheduled" | "processed" | "ignored" | "failed" | "cancelled">().notNull(),
    processedAt: ts("processed_at"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("events_idempotency_idx").on(t.workspaceId, t.idempotencyKey),
    index("events_due_idx").on(t.workspaceId, t.status, t.dueAt),
  ],
);

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  workspaceId: workspaceRef(),
  employeeId: text("employee_id"),
  eventId: integer("event_id"),
  trigger: text("trigger").notNull(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  outcome: text("outcome").$type<"acted" | "no_action" | "awaiting_approval" | "failed">(),
  summary: text("summary"),
});

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: serial("id").primaryKey(),
    workspaceId: workspaceRef(),
    runId: integer("run_id"),
    seq: integer("seq").notNull(),
    tool: text("tool").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    argsSummary: text("args_summary").notNull(),
    resultSummary: text("result_summary").notNull(),
    guard: text("guard").$type<Guard>().notNull(),
    status: text("status").$type<"ok" | "error" | "denied" | "timeout">().notNull(),
    durationMs: integer("duration_ms").notNull(),
    at: ts("at").notNull(),
  },
  (t) => [index("tool_calls_run_idx").on(t.workspaceId, t.runId)],
);

export const stateChanges = pgTable("state_changes", {
  id: serial("id").primaryKey(),
  workspaceId: workspaceRef(),
  runId: integer("run_id"),
  label: text("label").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value").notNull(),
  at: ts("at").notNull(),
});

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    workspaceId: workspaceRef(),
    employeeId: text("employee_id").notNull(),
    runId: integer("run_id"),
    caseKey: text("case_key").notNull(),
    at: ts("at").notNull(),
    actor: text("actor").notNull(),
    phase: text("phase").$type<ActivityPhase>().notNull(),
    summary: text("summary").notNull(),
    relatedTaskId: text("related_task_id"),
    action: text("action"),
    userVisible: boolean("user_visible").notNull().default(true),
    /** Headline used on the home "What Navo did" list, when this activity is one of them. */
    headline: text("headline"),
    headlineDetail: text("headline_detail"),
  },
  (t) => [index("activities_employee_idx").on(t.workspaceId, t.employeeId, t.at)],
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  workspaceId: workspaceRef(),
  recipientId: text("recipient_id").notNull(),
  kind: text("kind").$type<"needs_you" | "update">().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  at: ts("at").notNull(),
  push: boolean("push").notNull().default(false),
  composedBy: text("composed_by").$type<"claude" | "template">().notNull().default("template"),
});

/* ---------- Knowledge base (global, not workspace-scoped) ---------- */

export const policyDocuments = pgTable(
  "policy_documents",
  {
    id: text("id").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    effectiveDate: text("effective_date").notNull(),
    supersededBy: text("superseded_by"),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.id, t.version] })],
);

export const policySections = pgTable(
  "policy_sections",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    version: text("version").notNull(),
    ref: text("ref").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.version],
      foreignColumns: [policyDocuments.id, policyDocuments.version],
    }).onDelete("cascade"),
  ],
);

/* ---------- Mock enterprise systems ---------- */

export const hrRequests = pgTable(
  "hr_requests",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    type: text("type").$type<"employee_id" | "id_card" | "documents_review" | "question">().notNull(),
    status: text("status").$type<"open" | "in_progress" | "done">().notNull(),
    assigneeId: text("assignee_id").notNull(),
    note: text("note").notNull(),
    externalRef: text("external_ref"),
    createdAt: ts("created_at").notNull(),
    dueAt: ts("due_at"),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const itTickets = pgTable(
  "it_tickets",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    type: text("type").$type<"laptop" | "email" | "vpn" | "loaner" | "tool_access" | "access">().notNull(),
    status: text("status").$type<"requested" | "in_progress" | "ready" | "closed">().notNull(),
    detail: text("detail").notNull(),
    createdAt: ts("created_at").notNull(),
    expectedAt: ts("expected_at").notNull(),
    readyAt: ts("ready_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    location: text("location").notNull(),
    withPersonId: text("with_person_id"),
    ownerType: text("owner_type").$type<OwnerType>().notNull(),
    taskId: text("task_id"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const trainingEnrollments = pgTable(
  "training_enrollments",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    course: text("course").notNull(),
    minutes: integer("minutes").notNull(),
    status: text("status").$type<"enrolled" | "completed">().notNull(),
    dueAt: ts("due_at").notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const vendorChecks = pgTable(
  "vendor_checks",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    type: text("type").notNull(),
    status: text("status").$type<"in_progress" | "cleared" | "flagged">().notNull(),
    expectedAt: ts("expected_at").notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const facilitiesItems = pgTable(
  "facilities_items",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    item: text("item").notNull(),
    status: text("status").$type<"preparing" | "ready" | "collected">().notNull(),
    location: text("location").notNull(),
    readyAt: ts("ready_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const benefitEnrollments = pgTable(
  "benefit_enrollments",
  {
    workspaceId: workspaceRef(),
    id: text("id").notNull(),
    employeeId: text("employee_id").notNull(),
    plan: text("plan").notNull(),
    coverage: jsonb("coverage").$type<string[]>().notNull().default([]),
    status: text("status").$type<"open" | "enrolled">().notNull(),
    deadline: ts("deadline").notNull(),
    enrolledAt: ts("enrolled_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] })],
);

export const pulseResponses = pgTable("pulse_responses", {
  id: serial("id").primaryKey(),
  workspaceId: workspaceRef(),
  employeeId: text("employee_id").notNull(),
  score: integer("score").notNull(),
  at: ts("at").notNull(),
});

/** Per-workspace counters for human-readable ids such as R-1 or IT-55231. */
export const counters = pgTable(
  "counters",
  {
    workspaceId: workspaceRef(),
    name: text("name").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.name] })],
);

/** Global LLM usage ledger used by the daily budget guard on the hosted demo. */
/**
 * One row per Claude call, written before the call so the daily budget holds even when
 * calls fail. Not tied to a workspace row: usage outlives workspace resets.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: serial("id").primaryKey(),
    /** Real UTC date (operational budget, not simulated time). */
    day: text("day").notNull(),
    workspaceId: text("workspace_id"),
    feature: text("feature").$type<"ask" | "read_document" | "narrate">().notNull(),
    /** Whose key paid: the deployment's own, or a visitor's (bring your own key). */
    keySource: text("key_source").$type<"server" | "visitor">().notNull().default("server"),
    model: text("model"),
    /** `refused` is a model declining; the gateway then tries the next model in the route. */
    status: text("status").$type<"reserved" | "ok" | "refused" | "failed">().notNull().default("reserved"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    /** Personal numbers masked before sending, counted by kind (never the values). */
    masked: jsonb("masked").$type<Record<string, number>>(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("llm_usage_day_idx").on(t.day, t.workspaceId)],
);
