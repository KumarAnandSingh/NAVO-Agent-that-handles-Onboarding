import { leadTimeCompletion, type WorkingCalendar, HALDEN_CALENDAR } from "./time";
import type { DependencyEdge, TaskNode } from "./types";

export class CircularDependencyError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Circular dependency: ${cycle.join(" → ")}`);
    this.name = "CircularDependencyError";
  }
}

/**
 * Read-only view over a joiner's task graph. Only `blocks` edges gate work;
 * `informs` edges carry context (e.g. documents inform the background check).
 */
export class DependencyGraph {
  private readonly tasks = new Map<string, TaskNode>();
  private readonly prerequisites = new Map<string, DependencyEdge[]>();
  private readonly dependents = new Map<string, DependencyEdge[]>();

  constructor(tasks: readonly TaskNode[], edges: readonly DependencyEdge[]) {
    for (const task of tasks) this.tasks.set(task.id, task);
    for (const edge of edges) {
      if (!this.tasks.has(edge.prerequisiteTaskId) || !this.tasks.has(edge.dependentTaskId)) {
        throw new Error(`Dependency references an unknown task: ${edge.prerequisiteTaskId} → ${edge.dependentTaskId}`);
      }
      push(this.prerequisites, edge.dependentTaskId, edge);
      push(this.dependents, edge.prerequisiteTaskId, edge);
    }
    const cycle = findCycle([...this.tasks.keys()], edges);
    if (cycle) throw new CircularDependencyError(cycle);
  }

  task(id: string): TaskNode {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);
    return task;
  }

  allTasks(): TaskNode[] {
    return [...this.tasks.values()];
  }

  /** Incomplete prerequisites that block this task. */
  blockingPrerequisites(taskId: string): TaskNode[] {
    return (this.prerequisites.get(taskId) ?? [])
      .filter((edge) => edge.type === "blocks")
      .map((edge) => this.task(edge.prerequisiteTaskId))
      .filter((task) => task.status !== "completed");
  }

  isEligible(taskId: string): boolean {
    return this.blockingPrerequisites(taskId).length === 0;
  }

  /** Direct dependents (any edge type). */
  directDependents(taskId: string): TaskNode[] {
    return (this.dependents.get(taskId) ?? []).map((edge) => this.task(edge.dependentTaskId));
  }

  /**
   * Dependents that become eligible once `completedTaskId` is done: every one of their
   * blocking prerequisites is complete (treating `completedTaskId` as complete).
   */
  unblockedBy(completedTaskId: string): TaskNode[] {
    return (this.dependents.get(completedTaskId) ?? [])
      .filter((edge) => edge.type === "blocks")
      .map((edge) => this.task(edge.dependentTaskId))
      .filter((dependent) => dependent.status === "blocked")
      .filter((dependent) =>
        this.blockingPrerequisites(dependent.id).every((pre) => pre.id === completedTaskId),
      );
  }

  /** Every task that transitively depends on `taskId` through blocking edges. */
  downstream(taskId: string): TaskNode[] {
    const seen = new Set<string>();
    const queue = [taskId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of this.dependents.get(current) ?? []) {
        if (edge.type !== "blocks" || seen.has(edge.dependentTaskId)) continue;
        seen.add(edge.dependentTaskId);
        queue.push(edge.dependentTaskId);
      }
    }
    return [...seen].map((id) => this.task(id));
  }

  /** Every task `taskId` transitively waits on through blocking edges. */
  upstream(taskId: string): TaskNode[] {
    const seen = new Set<string>();
    const queue = [taskId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of this.prerequisites.get(current) ?? []) {
        if (edge.type !== "blocks" || seen.has(edge.prerequisiteTaskId)) continue;
        seen.add(edge.prerequisiteTaskId);
        queue.push(edge.prerequisiteTaskId);
      }
    }
    return [...seen].map((id) => this.task(id));
  }

  /** Tasks in dependency order (prerequisites first). */
  topologicalOrder(): TaskNode[] {
    const inDegree = new Map<string, number>();
    for (const id of this.tasks.keys()) inDegree.set(id, 0);
    for (const edges of this.prerequisites.values()) {
      for (const edge of edges) inDegree.set(edge.dependentTaskId, (inDegree.get(edge.dependentTaskId) ?? 0) + 1);
    }
    const ready = [...inDegree.entries()].filter(([, n]) => n === 0).map(([id]) => id);
    const order: TaskNode[] = [];
    while (ready.length > 0) {
      const id = ready.shift() as string;
      order.push(this.task(id));
      for (const edge of this.dependents.get(id) ?? []) {
        const remaining = (inDegree.get(edge.dependentTaskId) ?? 0) - 1;
        inDegree.set(edge.dependentTaskId, remaining);
        if (remaining === 0) ready.push(edge.dependentTaskId);
      }
    }
    return order;
  }

  /**
   * Best-case completion time for every task, given `now` and known ETAs from owning
   * systems. Overdue items are assumed to complete now, which yields the most generous
   * projection; anything that still misses its deadline under it is a certain miss.
   */
  projectCompletions(now: Date, etas: ReadonlyMap<string, Date> = new Map(), calendar: WorkingCalendar = HALDEN_CALENDAR): Map<string, Date> {
    const projection = new Map<string, Date>();
    for (const task of this.topologicalOrder()) {
      if (task.status === "completed") {
        projection.set(task.id, task.completedAt ? new Date(task.completedAt) : now);
        continue;
      }
      const eta = etas.get(task.id);
      if (eta) {
        projection.set(task.id, eta.getTime() > now.getTime() ? eta : now);
        continue;
      }
      let start = now;
      for (const edge of this.prerequisites.get(task.id) ?? []) {
        if (edge.type !== "blocks") continue;
        const prerequisiteDone = projection.get(edge.prerequisiteTaskId) ?? now;
        if (prerequisiteDone.getTime() > start.getTime()) start = prerequisiteDone;
      }
      const started = task.status === "waiting" || task.status === "in_progress" || task.status === "needs_user";
      if (task.leadWorkingDays > 0) {
        projection.set(task.id, leadTimeCompletion(start, task.leadWorkingDays, calendar));
      } else if (started && task.dueAt && new Date(task.dueAt).getTime() > start.getTime()) {
        // An owner who has already taken the item on is expected to deliver by its deadline.
        projection.set(task.id, new Date(task.dueAt));
      } else {
        projection.set(task.id, start);
      }
    }
    return projection;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Depth-first search for a cycle; returns the cycle path (first node repeated at the end) or null. */
export function findCycle(taskIds: readonly string[], edges: readonly DependencyEdge[]): string[] | null {
  const next = new Map<string, string[]>();
  for (const edge of edges) push(next, edge.prerequisiteTaskId, edge.dependentTaskId);
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, "visiting");
    path.push(id);
    for (const child of next.get(id) ?? []) {
      const childState = state.get(child);
      if (childState === "visiting") return [...path.slice(path.indexOf(child)), child];
      if (!childState) {
        const found = visit(child);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, "done");
    return null;
  };

  for (const id of taskIds) {
    if (!state.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return null;
}
