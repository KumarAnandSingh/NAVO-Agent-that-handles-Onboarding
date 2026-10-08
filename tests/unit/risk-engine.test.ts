import { describe, expect, it } from "vitest";
import { DependencyGraph } from "@/domain/dependency-engine";
import { assessRisk, isAtRisk, maxRisk } from "@/domain/risk-engine";
import { atIst } from "@/domain/time";
import type { TaskNode } from "@/domain/types";
import { blocks, node } from "./helpers";

const DAY1 = atIst("2026-10-19", "09:00");
const ID_DUE = atIst("2026-10-13", "18:00").toISOString();

function anandGraph(overrides: Record<string, Partial<TaskNode>> = {}) {
  const tasks = [
    node("employee_id", { ownerType: "hr", status: "waiting", dueAt: ID_DUE, requiredForDay1: true, ...overrides.employee_id }),
    node("laptop", { leadWorkingDays: 2, requiredForDay1: true, ...overrides.laptop }),
    node("email", { leadWorkingDays: 1, requiredForDay1: true, ...overrides.email }),
    node("vpn", { requiredForDay1: true, ...overrides.vpn }),
  ];
  return new DependencyGraph(tasks, [blocks("employee_id", "laptop"), blocks("employee_id", "email"), blocks("laptop", "vpn")]);
}

describe("risk engine", () => {
  it("flags HIGH when an overdue prerequisite leaves no working-day slack (Thu 09:15)", () => {
    const report = assessRisk({ graph: anandGraph(), now: atIst("2026-10-15", "09:15"), day1Start: DAY1 });
    expect(report.day1Level).toBe("high");
    expect(report.driver?.taskId).toBe("laptop");
    expect(report.byTask.get("laptop")?.slackWorkingDays).toBe(0);
    expect(report.byTask.get("employee_id")?.level).toBe("high");
    expect(report.driverLastSafeStart?.toISOString()).toBe(atIst("2026-10-15", "12:00").toISOString());
  });

  it("is MEDIUM a day earlier while one working day of slack remains", () => {
    const report = assessRisk({ graph: anandGraph(), now: atIst("2026-10-14", "09:15"), day1Start: DAY1 });
    expect(report.byTask.get("laptop")?.level).toBe("medium");
  });

  it("escalates to CRITICAL as the joining date approaches and the laptop can no longer make Day 1", () => {
    const afterCutoff = assessRisk({ graph: anandGraph(), now: atIst("2026-10-15", "13:00"), day1Start: DAY1 });
    expect(afterCutoff.day1Level).toBe("critical");
    const friday = assessRisk({ graph: anandGraph(), now: atIst("2026-10-16", "09:17"), day1Start: DAY1 });
    expect(friday.byTask.get("laptop")?.willMiss).toBe(true);
    expect(friday.driver?.taskId).toBe("laptop");
  });

  it("drops to LOW once the blocker clears and the chain is tight but healthy", () => {
    const graph = anandGraph({ employee_id: { status: "completed", completedAt: atIst("2026-10-15", "10:43").toISOString() } });
    const report = assessRisk({ graph, now: atIst("2026-10-15", "10:44"), day1Start: DAY1 });
    expect(report.day1Level).toBe("low");
    expect(isAtRisk(report.day1Level)).toBe(false);
  });

  it("reports no risk when everything is on track", () => {
    const graph = anandGraph({ employee_id: { status: "completed" } });
    const report = assessRisk({ graph, now: atIst("2026-10-07", "18:00"), day1Start: DAY1 });
    expect(report.day1Level).toBe("none");
    expect(report.driver).toBeNull();
  });

  it("marks an overdue task without Day-1 impact as MEDIUM", () => {
    const graph = new DependencyGraph([node("bgv", { ownerType: "vendor", status: "in_progress", dueAt: atIst("2026-10-13", "18:00").toISOString() })], []);
    const report = assessRisk({ graph, now: atIst("2026-10-15", "09:15"), day1Start: DAY1 });
    expect(report.byTask.get("bgv")?.level).toBe("medium");
    expect(report.day1Level).toBe("none");
  });

  it("uses IT's ETA when a ticket is in progress", () => {
    const graph = anandGraph({
      employee_id: { status: "completed" },
      laptop: { status: "in_progress" },
    });
    const etas = new Map([["laptop", atIst("2026-10-20", "10:05")]]);
    const report = assessRisk({ graph, now: atIst("2026-10-16", "09:00"), day1Start: DAY1, etas });
    expect(report.byTask.get("laptop")?.level).toBe("critical");
  });

  it("treats a committed ETA (e.g. an approved loaner) as covering the Day-1 need", () => {
    const etas = new Map([["laptop", atIst("2026-10-16", "16:00")]]);
    const report = assessRisk({ graph: anandGraph(), now: atIst("2026-10-16", "09:31"), day1Start: DAY1, etas });
    expect(report.byTask.get("laptop")?.level).toBe("low");
  });

  it("ignores lateness that is not on the critical chain", () => {
    // Access waits on email (fine) and on training due Sunday; the late ID isn't what sets its finish.
    const graph = new DependencyGraph(
      [
        node("employee_id", { ownerType: "hr", status: "waiting", dueAt: ID_DUE, requiredForDay1: true }),
        node("email", { leadWorkingDays: 1, requiredForDay1: true }),
        node("training", { ownerType: "employee", status: "needs_user", dueAt: atIst("2026-10-18", "23:59").toISOString() }),
        node("access", { requiredForDay1: true }),
      ],
      [blocks("employee_id", "email"), blocks("email", "access"), blocks("training", "access")],
    );
    const report = assessRisk({ graph, now: atIst("2026-10-14", "09:15"), day1Start: DAY1 });
    expect(report.byTask.get("access")?.level).toBe("low");
    expect(report.byTask.get("access")?.overdueUpstream).toHaveLength(0);
  });

  it("orders risk levels", () => {
    expect(maxRisk("low", "high")).toBe("high");
    expect(maxRisk("critical", "medium")).toBe("critical");
  });
});
