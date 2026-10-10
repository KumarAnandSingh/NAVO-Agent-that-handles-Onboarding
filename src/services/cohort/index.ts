/**
 * Loads every joiner's task graph in one pass (a handful of queries for the whole
 * workspace, not a snapshot per joiner) and runs the cohort radar for each what-if.
 */
import { asc, eq } from "drizzle-orm";
import { committedEtas } from "@/agent/snapshot";
import { assessCohort, WHAT_IFS, type CohortReport, type JoinerGraph } from "@/domain/cohort";
import { DependencyGraph } from "@/domain/dependency-engine";
import { atIst } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { dependencies, employees, itTickets, tasks, vendorChecks } from "@/lib/db/schema";
import { toTaskNode } from "@/services/onboarding-state/repository";

const groupBy = <T, K>(rows: readonly T[], key: (row: T) => K) => {
  const map = new Map<K, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};

export async function loadJoinerGraphs(db: Queryable, workspaceId: string, now: Date): Promise<JoinerGraph[]> {
  const [joiners, taskRows, edgeRows, ticketRows, checkRows] = await Promise.all([
    db.select().from(employees).where(eq(employees.workspaceId, workspaceId)),
    db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).orderBy(asc(tasks.sortOrder)),
    db.select().from(dependencies).where(eq(dependencies.workspaceId, workspaceId)),
    db.select().from(itTickets).where(eq(itTickets.workspaceId, workspaceId)),
    db.select().from(vendorChecks).where(eq(vendorChecks.workspaceId, workspaceId)),
  ]);
  const tasksBy = groupBy(taskRows, (t) => t.employeeId);
  const ticketsBy = groupBy(ticketRows, (t) => t.employeeId);
  const checksBy = groupBy(checkRows, (c) => c.employeeId);
  return joiners.map((e) => {
    const rows = tasksBy.get(e.personId) ?? [];
    const ids = new Set(rows.map((r) => r.id));
    const edges = edgeRows.filter((d) => ids.has(d.dependentTaskId)).map((d) => ({ prerequisiteTaskId: d.prerequisiteTaskId, dependentTaskId: d.dependentTaskId, type: d.type }));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return {
      employeeId: e.personId,
      day1Start: atIst(e.joiningDate, "09:00"),
      graph: new DependencyGraph(rows.map(toTaskNode), edges),
      etas: committedEtas(byKey, ticketsBy.get(e.personId) ?? [], checksBy.get(e.personId) ?? [], now),
    };
  });
}

/** The radar for every what-if scenario, so the HR console can switch between them instantly. */
export async function cohortRadar(db: Queryable, workspaceId: string, now: Date): Promise<CohortReport[]> {
  const joiners = await loadJoinerGraphs(db, workspaceId, now);
  return WHAT_IFS.map((whatIf) => assessCohort(joiners, now, whatIf));
}
