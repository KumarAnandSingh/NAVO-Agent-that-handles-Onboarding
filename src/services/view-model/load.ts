import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
import { cohortRadar } from "@/services/cohort";
import { listPolicies } from "@/services/policy-retrieval/upload";
import { requireWorkspace } from "@/services/workspace";

const RECENT_RUNS = 4;

/**
 * Everything the presenter needs, loaded in one place. Independent queries run in parallel,
 * so building a screen costs a couple of round trips to Postgres rather than twenty.
 */
export async function loadState(db: Queryable, workspaceId: string, employeeId = FEATURED_EMPLOYEE_ID) {
  const workspace = await requireWorkspace(db, workspaceId);
  const mine = (table: { workspaceId: AnyPgColumn; employeeId: AnyPgColumn }) => and(eq(table.workspaceId, workspaceId), eq(table.employeeId, employeeId));

  const [people, allEmployees, allTasks, docs, fields, approvalRows, followUpRows, tickets, calendar, activityRows, notificationRows, benefits, runRows, pulseRows, toolCallCount, upcoming, policies, cohort] =
    await Promise.all([
      listPeople(db, workspaceId),
      db.select().from(employees).where(eq(employees.workspaceId, workspaceId)),
      db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).orderBy(asc(tasks.sortOrder)),
      db.select().from(documents).where(mine(documents)).orderBy(asc(documents.sortOrder)),
      db.select().from(formFields).where(mine(formFields)).orderBy(asc(formFields.sortOrder)),
      db.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)),
      db.select().from(followUps).where(eq(followUps.workspaceId, workspaceId)),
      db.select().from(itTickets).where(mine(itTickets)),
      db.select().from(calendarEvents).where(mine(calendarEvents)).orderBy(asc(calendarEvents.startsAt)),
      db.select().from(activities).where(mine(activities)).orderBy(asc(activities.at), asc(activities.id)),
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.recipientId, employeeId)))
        .orderBy(desc(notifications.at), desc(notifications.id))
        .limit(30),
      db.select().from(benefitEnrollments).where(mine(benefitEnrollments)),
      // The most recent runs; only those that called tools are shown.
      db.select().from(agentRuns).where(mine(agentRuns)).orderBy(desc(agentRuns.id)).limit(40),
      db.select().from(pulseResponses).where(mine(pulseResponses)).orderBy(desc(pulseResponses.at)).limit(1),
      db.select({ n: count() }).from(toolCalls).where(eq(toolCalls.workspaceId, workspaceId)),
      upcomingEvents(db, workspaceId, 5),
      listPolicies(db, workspaceId, workspace.simNow),
      cohortRadar(db, workspaceId, workspace.simNow),
    ]);

  const runIds = runRows.map((r) => r.id);
  const [calls, changes] = runIds.length
    ? await Promise.all([
        db.select().from(toolCalls).where(and(eq(toolCalls.workspaceId, workspaceId), inArray(toolCalls.runId, runIds))).orderBy(asc(toolCalls.id)),
        db.select().from(stateChanges).where(and(eq(stateChanges.workspaceId, workspaceId), inArray(stateChanges.runId, runIds))).orderBy(asc(stateChanges.id)),
      ])
    : [[], []];
  const runsWithTools = runRows.filter((run) => calls.some((c) => c.runId === run.id)).slice(0, RECENT_RUNS);

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
    pulse: pulseRows[0] ?? null,
    toolCallCount: toolCallCount[0]?.n ?? 0,
    policies,
    cohort,
  };
}

export type LoadedState = Awaited<ReturnType<typeof loadState>>;
