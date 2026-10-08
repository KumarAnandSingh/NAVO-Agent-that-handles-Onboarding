import { beforeAll, describe, expect, it } from "vitest";
import { advance } from "@/agent/runtime";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { requireWorkspace, createWorkspace } from "@/services/workspace";
import { formatDayClock } from "@/domain/time";
import { activityLog, deps, failedEvents, followUpRows, taskByKey, ticketRows, toolLog, toThursdayMorning } from "./helpers";

let db: Db;
let ws: string;

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_responds")).id;
  await toThursdayMorning(db, ws);
});

describe("golden path: HR responds", () => {
  it("finishes the documents chapter and books Day 1 essentials", async () => {
    expect((await taskByKey(db, ws, "documents")).status).toBe("completed");
    expect((await taskByKey(db, ws, "forms")).status).toBe("completed");
    expect((await taskByKey(db, ws, "manager_1on1")).status).toBe("completed");
    expect((await taskByKey(db, ws, "security_training")).status).toBe("needs_user");
    const empid = await taskByKey(db, ws, "employee_id");
    expect(empid.status).toBe("waiting");
    expect(empid.dueAt?.toISOString()).toBe("2026-10-13T12:30:00.000Z");
    expect(await failedEvents(db, ws)).toHaveLength(0);
  });

  it("noticed the late Employee ID on Wednesday and kept watching", async () => {
    const log = await activityLog(db, ws);
    expect(log.some((a) => a.phase === "Noticed" && a.summary.includes("I'm watching"))).toBe(true);
    expect(await followUpRows(db, ws)).toHaveLength(0);
  });

  it("detects the Day-1 risk at Thursday 09:15 and reminds HR", async () => {
    const result = await advance(db, ws, deps);
    expect(formatDayClock(result.to)).toBe("Thu 15 Oct · 09:17");
    const reminders = await followUpRows(db, ws);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.toPersonId).toBe("priya.nair");
    const log = await toolLog(db, ws);
    const lastRun = log.filter((t) => t.runId === log.at(-1)?.runId).map((t) => t.tool);
    expect(lastRun).toEqual(["get_onboarding_state", "get_dependencies", "calculate_day1_risk", "check_permission", "send_reminder", "notify_employee"]);
    expect((await taskByKey(db, ws, "laptop")).riskLevel).toBe("high");
  });

  it("raises the laptop and email requests when HR issues the ID", async () => {
    const result = await advance(db, ws, deps);
    expect(formatDayClock(result.to)).toBe("Thu 15 Oct · 10:44");
    expect((await taskByKey(db, ws, "employee_id")).status).toBe("completed");
    const tickets = await ticketRows(db, ws);
    expect(tickets.map((t) => t.type).sort()).toEqual(["email", "laptop"]);
    expect((await followUpRows(db, ws))[0]?.status).toBe("resolved");
    expect((await taskByKey(db, ws, "laptop")).riskLevel).toBe("low");
  });

  it("is ready for Monday by Friday with one pickup booked", async () => {
    for (let i = 0; i < 12; i++) {
      const ws_ = await requireWorkspace(db, ws);
      if (ws_.simNow.toISOString() >= "2026-10-16T12:00:00.000Z") break;
      await advance(db, ws, deps);
    }
    expect((await taskByKey(db, ws, "laptop")).status).toBe("completed");
    expect((await taskByKey(db, ws, "background_check")).status).toBe("completed");
    expect((await taskByKey(db, ws, "pickup")).status).toBe("completed");
    expect(await failedEvents(db, ws)).toHaveLength(0);
  });
});
