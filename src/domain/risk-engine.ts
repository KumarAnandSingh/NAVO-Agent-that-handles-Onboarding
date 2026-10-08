import type { DependencyGraph } from "./dependency-engine";
import { dateKeyOf, HALDEN_CALENDAR, lastSafeStart, workingDaysBetween, type WorkingCalendar } from "./time";
import { RISK_LEVELS, type RiskLevel, type TaskNode } from "./types";

export interface TaskRisk {
  taskId: string;
  level: RiskLevel;
  projectedAt: Date;
  deadline: Date | null;
  /** Whole working days between the projected finish and the deadline day. */
  slackWorkingDays: number | null;
  willMiss: boolean;
  overdue: boolean;
  /** Overdue, incomplete tasks this task (transitively) waits on. */
  overdueUpstream: TaskNode[];
}

export interface RiskReport {
  /** Highest risk across tasks that must be done before Day 1. */
  day1Level: RiskLevel;
  byTask: Map<string, TaskRisk>;
  /** The Day-1 task driving the overall risk, if any. */
  driver: TaskRisk | null;
  /** Latest moment the driver's chain can still start and make Day 1. */
  driverLastSafeStart: Date | null;
}

export interface RiskInput {
  graph: DependencyGraph;
  now: Date;
  day1Start: Date;
  /** Completion ETAs reported by owning systems (IT tickets, vendor checks, facilities). */
  etas?: ReadonlyMap<string, Date>;
  calendar?: WorkingCalendar;
}

export const riskRank = (level: RiskLevel) => RISK_LEVELS.indexOf(level);
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (riskRank(a) >= riskRank(b) ? a : b);
export const isAtRisk = (level: RiskLevel) => riskRank(level) >= riskRank("high");

const isOverdue = (task: TaskNode, now: Date) =>
  task.status !== "completed" && task.dueAt !== null && new Date(task.dueAt).getTime() < now.getTime();

/**
 * Deterministic Day-1 risk. Explicit rules, no model involved:
 * - a task projected to finish after its deadline (even in the best case) is critical;
 * - a Day-1 task with no working-day slack behind an overdue prerequisite is high;
 * - one working day of slack behind an overdue prerequisite is medium; more is low;
 * - a tight but healthy chain (zero slack, nothing overdue) is low;
 * - an overdue task carries the highest risk it causes downstream.
 */
export function assessRisk({ graph, now, day1Start, etas, calendar = HALDEN_CALENDAR }: RiskInput): RiskReport {
  const projection = graph.projectCompletions(now, etas, calendar);
  const byTask = new Map<string, TaskRisk>();

  for (const task of graph.allTasks()) {
    if (task.status === "completed") continue;
    const projectedAt = projection.get(task.id) ?? now;
    const deadline = task.requiredForDay1 ? day1Start : task.dueAt ? new Date(task.dueAt) : null;
    const overdue = isOverdue(task, now);
    const overdueUpstream = graph.upstream(task.id).filter((t) => isOverdue(t, now));
    // An item already past its own deadline is "overdue", not a future miss; Day-1 items
    // are judged against Day 1 itself.
    const willMiss = deadline !== null && projectedAt.getTime() > deadline.getTime() && (task.requiredForDay1 || !overdue);
    const slack = deadline ? workingDaysBetween(dateKeyOf(projectedAt), dateKeyOf(deadline), calendar) : null;

    let level: RiskLevel = "none";
    if (willMiss) {
      level = "critical";
    } else if (task.requiredForDay1 && slack !== null) {
      const behindOverdue = overdue || overdueUpstream.length > 0;
      if (behindOverdue) level = slack === 0 ? "high" : slack === 1 ? "medium" : "low";
      else if (slack === 0) level = "low";
    } else if (overdue) {
      level = "medium";
    }

    byTask.set(task.id, { taskId: task.id, level, projectedAt, deadline, slackWorkingDays: slack, willMiss, overdue, overdueUpstream });
  }

  // Overdue causes inherit the risk they create downstream.
  for (const risk of byTask.values()) {
    if (!risk.overdue) continue;
    for (const dependent of graph.downstream(risk.taskId)) {
      const downstreamRisk = byTask.get(dependent.id);
      if (downstreamRisk) risk.level = maxRisk(risk.level, downstreamRisk.level);
    }
  }

  let driver: TaskRisk | null = null;
  let day1Level: RiskLevel = "none";
  for (const task of graph.allTasks()) {
    const risk = byTask.get(task.id);
    if (!risk || !task.requiredForDay1) continue;
    day1Level = maxRisk(day1Level, risk.level);
    if (risk.level === "none") continue;
    if (
      !driver ||
      riskRank(risk.level) > riskRank(driver.level) ||
      (risk.level === driver.level && task.leadWorkingDays > graph.task(driver.taskId).leadWorkingDays)
    ) {
      driver = risk;
    }
  }

  const driverTask = driver ? graph.task(driver.taskId) : null;
  const driverLastSafeStart =
    driverTask && driverTask.leadWorkingDays > 0 ? lastSafeStart(day1Start, driverTask.leadWorkingDays, calendar) : null;

  return { day1Level, byTask, driver, driverLastSafeStart };
}
