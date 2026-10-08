import type { TaskStatus } from "./types";

/**
 * Allowed task status transitions. Completed is terminal: onboarding items are never
 * silently re-opened; a new follow-up task is created instead.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["waiting", "in_progress", "needs_user", "blocked", "completed"],
  blocked: ["pending", "waiting", "in_progress", "needs_user"],
  waiting: ["in_progress", "needs_user", "blocked", "completed"],
  in_progress: ["waiting", "needs_user", "blocked", "completed"],
  needs_user: ["in_progress", "waiting", "completed"],
  completed: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly taskId: string,
    readonly from: TaskStatus,
    readonly to: TaskStatus,
    reason: string,
  ) {
    super(`Task ${taskId}: cannot move ${from} → ${to}. ${reason}`);
    this.name = "InvalidTransitionError";
  }
}

export interface TransitionContext {
  /** Whether every blocking prerequisite of the task is completed. */
  prerequisitesComplete: boolean;
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a status change. A blocked task may only be unblocked once its blocking
 * prerequisites are complete, and nothing can be completed while still blocked.
 */
export function assertTransition(taskId: string, from: TaskStatus, to: TaskStatus, context: TransitionContext): void {
  if (from === to) {
    throw new InvalidTransitionError(taskId, from, to, "Status is unchanged.");
  }
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(taskId, from, to, "Transition is not allowed.");
  }
  if (from === "blocked" && !context.prerequisitesComplete) {
    throw new InvalidTransitionError(taskId, from, to, "Blocking prerequisites are not complete.");
  }
}

/** Statuses that mean the item is still open. */
export function isOpen(status: TaskStatus): boolean {
  return status !== "completed";
}
