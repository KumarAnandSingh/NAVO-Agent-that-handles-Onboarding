import type { DependencyEdge, TaskNode } from "@/domain/types";

export function node(id: string, overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    key: id,
    name: id,
    ownerType: "it",
    status: "blocked",
    dueAt: null,
    leadWorkingDays: 0,
    requiredForDay1: false,
    completedAt: null,
    ...overrides,
  };
}

export function blocks(prerequisiteTaskId: string, dependentTaskId: string): DependencyEdge {
  return { prerequisiteTaskId, dependentTaskId, type: "blocks" };
}

export function informs(prerequisiteTaskId: string, dependentTaskId: string): DependencyEdge {
  return { prerequisiteTaskId, dependentTaskId, type: "informs" };
}
