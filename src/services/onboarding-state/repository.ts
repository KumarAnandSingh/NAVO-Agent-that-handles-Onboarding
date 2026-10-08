import { and, asc, eq, sql } from "drizzle-orm";
import { DependencyGraph } from "@/domain/dependency-engine";
import { assertTransition } from "@/domain/task-state-machine";
import type { DependencyEdge, RiskLevel, TaskNode, TaskStatus } from "@/domain/types";
import type { Queryable } from "@/lib/db/client";
import { counters, dependencies, employees, people, taskEvents, tasks } from "@/lib/db/schema";

export type TaskRow = typeof tasks.$inferSelect;
export type EmployeeRow = typeof employees.$inferSelect;
export type PersonRow = typeof people.$inferSelect;

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export function toTaskNode(row: TaskRow): TaskNode {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    ownerType: row.ownerType,
    status: row.status,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    leadWorkingDays: row.leadWorkingDays,
    requiredForDay1: row.requiredForDay1,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function getEmployee(db: Queryable, workspaceId: string, employeeId: string): Promise<EmployeeRow> {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.personId, employeeId)));
  if (!row) throw new NotFoundError(`Employee ${employeeId} not found`);
  return row;
}

export async function listPeople(db: Queryable, workspaceId: string): Promise<Map<string, PersonRow>> {
  const rows = await db.select().from(people).where(eq(people.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listTasks(db: Queryable, workspaceId: string, employeeId: string): Promise<TaskRow[]> {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.employeeId, employeeId)))
    .orderBy(asc(tasks.sortOrder));
}

export async function getTask(db: Queryable, workspaceId: string, id: string): Promise<TaskRow> {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!row) throw new NotFoundError(`Task ${id} not found`);
  return row;
}

export async function loadGraph(db: Queryable, workspaceId: string, employeeId: string): Promise<{ rows: TaskRow[]; graph: DependencyGraph }> {
  const rows = await listTasks(db, workspaceId, employeeId);
  const ids = new Set(rows.map((r) => r.id));
  const edgeRows = await db.select().from(dependencies).where(eq(dependencies.workspaceId, workspaceId));
  const edges: DependencyEdge[] = edgeRows
    .filter((e) => ids.has(e.dependentTaskId))
    .map((e) => ({ prerequisiteTaskId: e.prerequisiteTaskId, dependentTaskId: e.dependentTaskId, type: e.type }));
  return { rows, graph: new DependencyGraph(rows.map(toTaskNode), edges) };
}

export interface TaskUpdate {
  status?: TaskStatus;
  statusNote?: string | null;
  blockedReason?: string | null;
  nextAction?: string | null;
  dueAt?: Date | null;
  riskLevel?: RiskLevel;
  riskReason?: string | null;
  evidence?: string[];
  ownerId?: string | null;
}

/**
 * Apply a change to a task with optimistic locking: the update only lands if the row is
 * still at `expectedVersion`, so two writers can never silently overwrite each other.
 * Status changes are validated by the state machine and recorded in task_events.
 */
export async function updateTask(
  db: Queryable,
  task: TaskRow,
  change: TaskUpdate,
  meta: { actor: string; at: Date; reason?: string; prerequisitesComplete?: boolean },
): Promise<TaskRow> {
  const statusChanged = change.status !== undefined && change.status !== task.status;
  if (statusChanged && change.status) {
    assertTransition(task.id, task.status, change.status, {
      prerequisitesComplete: meta.prerequisitesComplete ?? true,
    });
  }
  const values: Partial<typeof tasks.$inferInsert> = {
    ...change,
    status: change.status ?? task.status,
    updatedAt: meta.at,
    version: task.version + 1,
  };
  if (statusChanged && change.status === "completed") values.completedAt = meta.at;
  if (statusChanged && change.status !== "blocked") values.blockedReason = change.blockedReason ?? null;

  const [updated] = await db
    .update(tasks)
    .set(values)
    .where(and(eq(tasks.workspaceId, task.workspaceId), eq(tasks.id, task.id), eq(tasks.version, task.version)))
    .returning();
  if (!updated) {
    throw new ConflictError(`Task ${task.id} changed since version ${task.version}; reload and retry`);
  }
  if (statusChanged && change.status) {
    await db.insert(taskEvents).values({
      workspaceId: task.workspaceId,
      taskId: task.id,
      fromStatus: task.status,
      toStatus: change.status,
      actor: meta.actor,
      reason: meta.reason ?? null,
      at: meta.at,
      version: updated.version,
    });
  }
  return updated;
}

export async function markDependenciesSatisfied(db: Queryable, workspaceId: string, prerequisiteTaskId: string): Promise<void> {
  await db
    .update(dependencies)
    .set({ status: "satisfied" })
    .where(and(eq(dependencies.workspaceId, workspaceId), eq(dependencies.prerequisiteTaskId, prerequisiteTaskId)));
}

/** Atomically increment a per-workspace counter and return the new value. */
export async function nextCounter(db: Queryable, workspaceId: string, name: string): Promise<number> {
  const [row] = await db
    .update(counters)
    .set({ value: sql`${counters.value} + 1` })
    .where(and(eq(counters.workspaceId, workspaceId), eq(counters.name, name)))
    .returning({ value: counters.value });
  if (!row) throw new NotFoundError(`Counter ${name} not found`);
  return row.value;
}
