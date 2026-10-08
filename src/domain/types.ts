/**
 * Core domain vocabulary shared by the engines, the agent and the database schema.
 * Everything here is plain data: no I/O, no framework imports.
 */

export const TASK_STATUSES = [
  "pending",
  "waiting",
  "in_progress",
  "blocked",
  "needs_user",
  "completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const RISK_LEVELS = ["none", "low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const OWNER_TYPES = [
  "employee",
  "hr",
  "hr_ops",
  "it",
  "manager",
  "buddy",
  "facilities",
  "vendor",
  "navo",
] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const PHASES = ["offer", "documents", "pre_joining", "day1", "week1", "day30"] as const;
export type Phase = (typeof PHASES)[number];

export const DEPENDENCY_TYPES = ["blocks", "informs"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** How a tool call or action is gated. Shown as a badge in the agent runtime panel. */
export const GUARDS = ["read", "policy", "auto", "approval", "event", "denied"] as const;
export type Guard = (typeof GUARDS)[number];

/** Product-level explanation phases: never hidden chain-of-thought, only what/why/what next. */
export const ACTIVITY_PHASES = [
  "Noticed",
  "Decided",
  "Acted",
  "Asked",
  "Reported",
  "Planned",
  "Resolved",
] as const;
export type ActivityPhase = (typeof ACTIVITY_PHASES)[number];

export const SCENARIOS = ["hr_responds", "hr_silent"] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export interface TaskNode {
  id: string;
  key: string;
  name: string;
  ownerType: OwnerType;
  status: TaskStatus;
  /** ISO timestamp of the deadline, if any. */
  dueAt: string | null;
  /** Working days the owner needs once the task can start. */
  leadWorkingDays: number;
  /** True when the task must be done before Day 1 starts. */
  requiredForDay1: boolean;
  completedAt: string | null;
}

export interface DependencyEdge {
  prerequisiteTaskId: string;
  dependentTaskId: string;
  type: DependencyType;
}
