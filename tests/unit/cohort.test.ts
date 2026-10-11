import { describe, expect, it } from "vitest";
import { WHAT_IFS, applyWhatIf, assessCohort, assessJoiner, type JoinerGraph } from "@/domain/cohort";
import { DependencyGraph } from "@/domain/dependency-engine";
import { atIst } from "@/domain/time";
import type { TaskNode } from "@/domain/types";
import { blocks, node } from "./helpers";

const NOW = atIst("2026-10-15", "09:15");
const whatIf = (id: string) => WHAT_IFS.find((w) => w.id === id)!;

/** A joiner whose laptop (IT, 2 working days) waits on the Employee ID (HR). */
function joiner(id: string, day1: string, idTask: Partial<TaskNode> = {}, etas: [string, Date][] = []): JoinerGraph {
  const graph = new DependencyGraph(
    [
      node(`${id}/employee_id`, { ownerType: "hr", status: "completed", completedAt: atIst("2026-10-12", "10:00").toISOString(), requiredForDay1: true, ...idTask }),
      node(`${id}/laptop`, { ownerType: "it", leadWorkingDays: 2, requiredForDay1: true }),
      node(`${id}/bgv`, { ownerType: "vendor", status: "in_progress", requiredForDay1: true }),
    ],
    [blocks(`${id}/employee_id`, `${id}/laptop`)],
  );
  return { employeeId: id, day1Start: atIst(day1, "09:00"), graph, etas: new Map(etas) };
}

describe("cohort radar", () => {
  it("runs the real risk engine for every joiner and names what drives each Day 1", () => {
    const late = joiner("anand", "2026-10-19", { status: "waiting", completedAt: null, dueAt: atIst("2026-10-13", "18:00").toISOString() });
    const comfortable = joiner("aditi", "2026-10-26");
    const report = assessCohort([late, comfortable], NOW);
    expect(report.joiners.map((j) => [j.employeeId, j.level, j.driverOwner])).toEqual([
      ["anand", "high", "it"],
      ["aditi", "none", null],
    ]);
    expect(report.levels).toMatchObject({ high: 1, none: 1 });
    expect(report.bottlenecks).toEqual([{ team: "it", joiners: 1, worst: "high" }]);
  });

  it("shows where Day 1 would break if a team slowed down, without touching the real graph", () => {
    const cohort = [joiner("aditi", "2026-10-21"), joiner("rohit", "2026-10-22"), joiner("rohan", "2026-11-16")];
    const today = assessCohort(cohort, NOW);
    expect(today.joiners.every((j) => j.level === "none" || j.level === "low")).toBe(true);
    const itSlow = assessCohort(cohort, NOW, whatIf("it_slow"));
    // IT a week slower: the two joiners starting soon would miss Day 1; the one in November still makes it.
    expect(itSlow.joiners.map((j) => j.level)).toEqual(["critical", "critical", "none"]);
    expect(itSlow.bottlenecks).toEqual([{ team: "it", joiners: 2, worst: "critical" }]);
    expect(cohort[0]!.graph.task("aditi/laptop").leadWorkingDays).toBe(2);
  });

  it("moves committed dates and in-flight deadlines for the slowed team only", () => {
    const eta = atIst("2026-10-16", "14:30");
    const base = joiner("anand", "2026-10-19", {}, [["anand/bgv", eta], ["anand/laptop", eta]]);
    const vendorSlow = applyWhatIf(base, whatIf("vendor_slow"));
    expect(vendorSlow.etas.get("anand/bgv")?.toISOString()).toBe(atIst("2026-10-23", "14:30").toISOString());
    expect(vendorSlow.etas.get("anand/laptop")).toEqual(eta);
    expect(applyWhatIf(base, whatIf("today"))).toBe(base);
    const due = joiner("x", "2026-10-26", { status: "waiting", completedAt: null, dueAt: atIst("2026-10-16", "18:00").toISOString() });
    expect(applyWhatIf(due, whatIf("hr_slow")).graph.task("x/employee_id").dueAt).toBe(atIst("2026-10-20", "18:00").toISOString());
  });

  it("closes Day-1 risk once Day 1 has started", () => {
    const started = joiner("anand", "2026-10-19", { status: "waiting", completedAt: null });
    expect(assessJoiner(started, atIst("2026-10-19", "10:00"))).toMatchObject({ level: "none", driverTaskId: null });
  });
});
