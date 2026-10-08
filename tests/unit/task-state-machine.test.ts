import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, InvalidTransitionError, isOpen } from "@/domain/task-state-machine";

const ok = { prerequisitesComplete: true };

describe("task state machine", () => {
  it.each([
    ["pending", "completed"],
    ["waiting", "in_progress"],
    ["needs_user", "completed"],
    ["in_progress", "completed"],
    ["pending", "needs_user"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(() => assertTransition("t", from, to, ok)).not.toThrow();
  });

  it("moves BLOCKED → IN_PROGRESS once the prerequisite is complete", () => {
    expect(() => assertTransition("laptop", "blocked", "in_progress", { prerequisitesComplete: true })).not.toThrow();
  });

  it("keeps a task blocked while a prerequisite is incomplete", () => {
    expect(() => assertTransition("laptop", "blocked", "in_progress", { prerequisitesComplete: false })).toThrow(
      InvalidTransitionError,
    );
  });

  it("never completes a blocked task directly", () => {
    expect(canTransition("blocked", "completed")).toBe(false);
    expect(() => assertTransition("t", "blocked", "completed", ok)).toThrow(/not allowed/);
  });

  it("treats completed as terminal", () => {
    expect(() => assertTransition("t", "completed", "in_progress", ok)).toThrow(InvalidTransitionError);
  });

  it("rejects no-op transitions", () => {
    expect(() => assertTransition("t", "waiting", "waiting", ok)).toThrow(/unchanged/);
  });

  it("knows which statuses are open", () => {
    expect(isOpen("completed")).toBe(false);
    expect(isOpen("blocked")).toBe(true);
  });
});
