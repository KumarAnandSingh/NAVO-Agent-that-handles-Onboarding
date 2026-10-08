import { describe, expect, it } from "vitest";
import { CircularDependencyError, DependencyGraph, findCycle } from "@/domain/dependency-engine";
import { atIst } from "@/domain/time";
import { blocks, informs, node } from "./helpers";

const chain = () =>
  new DependencyGraph(
    [
      node("employee_id", { ownerType: "hr", status: "waiting" }),
      node("laptop", { leadWorkingDays: 2 }),
      node("vpn"),
      node("email", { leadWorkingDays: 1 }),
      node("training", { ownerType: "employee", status: "needs_user" }),
      node("access"),
    ],
    [
      blocks("employee_id", "laptop"),
      blocks("laptop", "vpn"),
      blocks("employee_id", "email"),
      blocks("email", "access"),
      blocks("vpn", "access"),
      blocks("training", "access"),
    ],
  );

describe("dependency engine", () => {
  it("keeps a dependent blocked while its prerequisite is incomplete", () => {
    const graph = chain();
    expect(graph.isEligible("laptop")).toBe(false);
    expect(graph.blockingPrerequisites("laptop").map((t) => t.id)).toEqual(["employee_id"]);
  });

  it("makes a dependent eligible once its prerequisite completes", () => {
    const graph = chain();
    expect(graph.unblockedBy("employee_id").map((t) => t.id).sort()).toEqual(["email", "laptop"]);
  });

  it("requires every prerequisite when there are several", () => {
    const graph = chain();
    // access waits on email, vpn and training; completing one is not enough.
    expect(graph.unblockedBy("training").map((t) => t.id)).toEqual([]);
    expect(graph.blockingPrerequisites("access").map((t) => t.id).sort()).toEqual(["email", "training", "vpn"]);
  });

  it("ignores informs edges for gating", () => {
    const graph = new DependencyGraph([node("documents", { status: "needs_user" }), node("bgv", { status: "in_progress" })], [informs("documents", "bgv")]);
    expect(graph.isEligible("bgv")).toBe(true);
  });

  it("traces upstream and downstream chains", () => {
    const graph = chain();
    expect(graph.downstream("employee_id").map((t) => t.id).sort()).toEqual(["access", "email", "laptop", "vpn"]);
    expect(graph.upstream("vpn").map((t) => t.id).sort()).toEqual(["employee_id", "laptop"]);
  });

  it("orders tasks prerequisites-first", () => {
    const order = chain().topologicalOrder().map((t) => t.id);
    expect(order.indexOf("employee_id")).toBeLessThan(order.indexOf("laptop"));
    expect(order.indexOf("laptop")).toBeLessThan(order.indexOf("vpn"));
    expect(order.indexOf("vpn")).toBeLessThan(order.indexOf("access"));
  });

  it("rejects circular dependencies", () => {
    expect(() => new DependencyGraph([node("a"), node("b"), node("c")], [blocks("a", "b"), blocks("b", "c"), blocks("c", "a")])).toThrow(
      CircularDependencyError,
    );
    expect(findCycle(["a", "b"], [blocks("a", "b"), blocks("b", "a")])).toEqual(["a", "b", "a"]);
    expect(findCycle(["a", "b"], [blocks("a", "b")])).toBeNull();
  });

  it("rejects edges to unknown tasks", () => {
    expect(() => new DependencyGraph([node("a")], [blocks("a", "ghost")])).toThrow(/unknown task/);
  });

  it("projects completion through lead times", () => {
    const now = atIst("2026-10-15", "09:15");
    const graph = chain();
    const projection = graph.projectCompletions(now);
    // The overdue/undated Employee ID is assumed to land now; laptop takes Thu + Fri.
    expect(projection.get("laptop")?.toISOString()).toBe(atIst("2026-10-16", "18:00").toISOString());
    expect(projection.get("email")?.toISOString()).toBe(atIst("2026-10-15", "18:00").toISOString());
    expect(projection.get("vpn")?.toISOString()).toBe(atIst("2026-10-16", "18:00").toISOString());
  });

  it("finds the critical chain that sets a task's finish", () => {
    const now = atIst("2026-10-15", "09:15");
    expect(chain().criticalChain("vpn", now).map((t) => t.id)).toEqual(["laptop", "employee_id"]);
  });

  it("uses ETAs reported by owning systems", () => {
    const now = atIst("2026-10-15", "11:00");
    const graph = new DependencyGraph([node("laptop", { status: "in_progress", leadWorkingDays: 2 })], []);
    const eta = atIst("2026-10-16", "10:05");
    expect(graph.projectCompletions(now, new Map([["laptop", eta]])).get("laptop")?.toISOString()).toBe(eta.toISOString());
  });
});
