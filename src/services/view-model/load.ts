import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import type { Queryable } from "@/lib/db/client";
import {
  activities,
  agentRuns,
  approvals,
  benefitEnrollments,
  calendarEvents,
  documents,
  employees,
  followUps,
  formFields,
  itTickets,
  notifications,
  pulseResponses,
  stateChanges,
  tasks,
  toolCalls,
} from "@/lib/db/schema";
import { upcomingEvents } from "@/services/events/queue";
import { listPeople } from "@/services/onboarding-state/repository";
import { requireWorkspace } from "@/services/workspace";

const RECENT_RUNS = 4;

/** Everything the presenter needs, loaded in one place. */
export async function loadState(db: Queryable, workspaceId: string, employeeId = FEATURED_EMPLOYEE_ID) {
  const workspace = await requireWorkspace(db, workspaceId);
  const people = await listPeople(db, workspaceId);
  const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
  const allTasks = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).orderBy(asc(tasks.sortOrder));
  const scoped = { workspace: workspaceId, employee: employeeId };

  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, scoped.workspace), eq(documents.employeeId, scoped.employee)))
    .orderBy(asc(documents.sortOrder));
  const fields = await db
    .select()
    .from(formFields)
    .where(and(eq(formFields.workspaceId, scoped.workspace), eq(formFields.employeeId, scoped.employee)))
    .orderBy(asc(formFields.sortOrder));
  const approvalRows = await db.select().from(approvals).where(eq(approvals.workspaceId, workspaceId));
  const followUpRows = await db.select().from(followUps).where(eq(followUps.workspaceId, workspaceId));
  const tickets = await db
    .select()
    .from(itTickets)
    .where(and(eq(itTickets.workspaceId, scoped.workspace), eq(itTickets.employeeId, scoped.employee)));
  const calendar = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.workspaceId, scoped.workspace), eq(calendarEvents.employeeId, scoped.employee)))
    .orderBy(asc(calendarEvents.startsAt));
  const activityRows = await db
    .select()
    .from(activities)
    .where(and(eq(activities.workspaceId, scoped.workspace), eq(activities.employeeId, scoped.employee)))
    .orderBy(asc(activities.at), asc(activities.id));
  const notificationRows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.workspaceId, scoped.workspace), eq(notifications.recipientId, scoped.employee)))
    .orderBy(desc(notifications.at), desc(notifications.id))
    .limit(30);
  const benefits = await db
    .select()
    .from(benefitEnrollments)
    .where(and(eq(benefitEnrollments.workspaceId, scoped.workspace), eq(benefitEnrollments.employeeId, scoped.employee)));

  // The most recent runs that actually did something visible.
  const runRows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.workspaceId, scoped.workspace), eq(agentRuns.employeeId, scoped.employee)))
    .orderBy(desc(agentRuns.id))
    .limit(40);
  const runIds = runRows.map((r) => r.id);
  const calls = runIds.length
    ? await db.select().from(toolCalls).where(and(eq(toolCalls.workspaceId, workspaceId), inArray(toolCalls.runId, runIds))).orderBy(asc(toolCalls.id))
    : [];
  const changes = runIds.length
    ? await db.select().from(stateChanges).where(and(eq(stateChanges.workspaceId, workspaceId), inArray(stateChanges.runId, runIds))).orderBy(asc(stateChanges.id))
    : [];
  const runsWithTools = runRows.filter((run) => calls.some((c) => c.runId === run.id)).slice(0, RECENT_RUNS);

  const [pulse] = await db
    .select()
    .from(pulseResponses)
    .where(and(eq(pulseResponses.workspaceId, scoped.workspace), eq(pulseResponses.employeeId, scoped.employee)))
    .orderBy(desc(pulseResponses.at))
    .limit(1);

  const [toolCallCount] = await db.select({ n: count() }).from(toolCalls).where(eq(toolCalls.workspaceId, workspaceId));

  const upcoming = await upcomingEvents(db, workspaceId, 5);

  return {
    workspace,
    employeeId,
    people,
    employees: allEmployees,
    tasks: allTasks,
    documents: docs,
    formFields: fields,
    approvals: approvalRows,
    followUps: followUpRows,
    tickets,
    calendar,
    activities: activityRows,
    notifications: notificationRows,
    benefits,
    runs: runsWithTools,
    toolCalls: calls,
    stateChanges: changes,
    upcoming,
    pulse: pulse ?? null,
    toolCallCount: toolCallCount?.n ?? 0,
  };
}

export type LoadedState = Awaited<ReturnType<typeof loadState>>;
