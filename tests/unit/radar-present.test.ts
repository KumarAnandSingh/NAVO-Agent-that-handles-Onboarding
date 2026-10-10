import { describe, expect, it } from "vitest";
import { WHAT_IFS, type CohortReport, type JoinerRisk } from "@/domain/cohort";
import { presentRadar } from "@/services/view-model/presenters/radar";

const risk = (employeeId: string, overrides: Partial<JoinerRisk> = {}): JoinerRisk => ({
  employeeId,
  level: "none",
  driverTaskId: null,
  driverOwner: null,
  slackWorkingDays: null,
  willMiss: false,
  ...overrides,
});

function report(whatIf: number, joiners: JoinerRisk[], bottlenecks: CohortReport["bottlenecks"] = []): CohortReport {
  const levels = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const j of joiners) levels[j.level]++;
  return { whatIf: WHAT_IFS[whatIf]!, joiners, levels, bottlenecks };
}

const input = (reports: CohortReport[]) => ({
  reports,
  names: new Map([
    ["a", "Asha Rao"],
    ["b", "Bilal Khan"],
  ]),
  joiners: [
    { personId: "a", role: "Engineer", joiningDate: "2026-10-26" },
    { personId: "b", role: "Analyst", joiningDate: "2026-10-27" },
  ],
  taskNames: new Map([["a/laptop", "Laptop"]]),
});

describe("cohort radar copy", () => {
  it("says how many joiners are at risk and which team drives them", () => {
    const today = report(0, [risk("a", { level: "high", driverTaskId: "a/laptop", driverOwner: "it", slackWorkingDays: 0 }), risk("b")], [{ team: "it", joiners: 1, worst: "high" }]);
    const [vm] = presentRadar(input([today])).scenarios;
    expect(vm!.summary).toBe("1 joiner at risk of a broken Day 1; IT drives 1.");
    expect(vm!.joiners.map((j) => [j.name, j.label, j.driver])).toEqual([
      ["Asha Rao", "At risk", "Laptop · IT · 0 working days of slack"],
      ["Bilal Khan", "On track", "Nothing on the critical path"],
    ]);
    expect(vm!.levels.map((l) => [l.label, l.count])).toEqual([
      ["Will miss Day 1", 0],
      ["At risk", 1],
      ["Watching", 0],
      ["On track", 1],
    ]);
  });

  it("words misses, one day of slack, watchers and unknown names and tasks", () => {
    const today = report(0, [risk("a", { level: "medium", driverTaskId: "a/vpn", driverOwner: "it", slackWorkingDays: 1 }), risk("x", { level: "low" })]);
    const slow = report(
      1,
      [risk("a", { level: "critical", driverTaskId: "a/laptop", driverOwner: "it", slackWorkingDays: -1, willMiss: true }), risk("x", { level: "critical", driverTaskId: "x/id", driverOwner: "hr", slackWorkingDays: null })],
      [{ team: "it", joiners: 2, worst: "critical" }],
    );
    const [now, whatIf] = presentRadar(input([today, slow])).scenarios;
    expect(now!.summary).toBe("No Day 1 at risk; 1 to watch.");
    expect(now!.joiners[0]!.driver).toBe("a/vpn · IT · 1 working day of slack");
    expect(whatIf!.summary).toBe("2 joiners at risk of a broken Day 1; IT drives all of them.");
    // Same level: an unknown joiner (no start date) sorts first.
    expect(whatIf!.joiners.map((j) => [j.name, j.driver, j.changed])).toEqual([
      ["x", "x/id · HR", true],
      ["Asha Rao", "Laptop · IT · misses Day 1", true],
    ]);
    expect(whatIf!.joiners[0]!.start).toBe("");
  });

  it("says every Day 1 still holds when a what-if changes nothing", () => {
    const [, vm] = presentRadar(input([report(0, [risk("a")]), report(2, [risk("a", { level: "low" })])])).scenarios;
    expect(vm!.summary).toBe("Every Day 1 still holds.");
    expect(vm!.joiners[0]!.changed).toBe(false);
  });
});
