import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { runUntil } from "@/agent/runtime";
import { atIst } from "@/domain/time";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { calendarEvents, employees, notifications } from "@/lib/db/schema";
import { advanceStory, jumpToChapter } from "@/services/demo-director";
import { bookWalkthrough, confirmPickup } from "@/services/employee-actions";
import { buildViewModel } from "@/server/respond";
import { OFFLINE } from "@/services/llm/gateway";
import { createWorkspace } from "@/services/workspace";
import { ANAND, activityLog, deps, failedEvents, taskByKey, toolLog } from "./helpers";

/**
 * The story after the risk is resolved, when the joiner does NOT do everything Navo asks:
 * training skipped, one item left at the pickup desk. Navo must stay truthful.
 */
let db: Db;
let ws: string;

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_responds")).id;
  // Ready for Day 1 (chapter 3) without doing the security training.
  await jumpToChapter(db, ws, 3);
});

describe("after Day 1 starts", () => {
  it("nudges the joiner about overdue training, naming what it holds up", async () => {
    // Training was due Sunday; the first check after that is Monday 09:15.
    await runUntil(db, ws, atIst("2026-10-19", "09:30"), deps);
    const [nudge] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.workspaceId, ws), eq(notifications.recipientId, ANAND), eq(notifications.title, "Security training is overdue")));
    expect(nudge?.body).toBe("It's holding up your email and VPN access. It takes 15 minutes.");
  });

  it("closes Day-1 risk once Day 1 has started instead of reporting a miss forever", async () => {
    await runUntil(db, ws, atIst("2026-10-20", "09:30"), deps);
    const [employee] = await db.select().from(employees).where(and(eq(employees.workspaceId, ws), eq(employees.personId, ANAND)));
    expect(employee?.day1Risk).toBe("none");
    const riskCalls = (await toolLog(db, ws)).filter((c) => c.tool === "calculate_day1_risk");
    expect(riskCalls.at(-1)?.resultSummary).toMatch(/^Day 1 has passed · \d+ overdue$/);
    expect(riskCalls.some((c) => /will miss Day 1/.test(c.resultSummary) && c.at.getTime() > atIst("2026-10-19", "09:00").getTime())).toBe(false);
  });
});

describe("a partial Day 1 pickup", () => {
  it("closes what was collected and asks the owner to hold the rest", async () => {
    const db2 = await createMemoryDb();
    const ws2 = (await createWorkspace(db2, "hr_responds")).id;
    await jumpToChapter(db2, ws2, 4);
    await runUntil(db2, ws2, atIst("2026-10-19", "11:20"), deps);
    await confirmPickup(db2, ws2, ANAND, ["id", "laptop"], deps);
    const calls = (await toolLog(db2, ws2)).filter((c) => c.tool === "notify_owner").slice(-3);
    expect(calls.map((c) => c.argsSummary)).toEqual([expect.stringContaining("priya.nair"), expect.stringContaining("it.desk"), expect.stringContaining("facilities.desk")]);
    const last = (await activityLog(db2, ws2)).at(-1);
    expect(last?.summary).toBe("Closed what you collected. Asked the team to hold your onboarding kit.");
    const vm = await buildViewModel(db2, ws2, OFFLINE);
    expect(vm.day1.wrapUp.find((r) => r.name === "Onboarding kit")?.status).toBe("Navo arranging a new pickup");
    expect(vm.day1.wrapUp.find((r) => r.name === "ID card collected")?.status).toBe("✓ Done");
  });
});

describe("week 1", () => {
  it("suggests a free slot, books it through the calendar tool on request, and only once", async () => {
    const db3 = await createMemoryDb();
    const ws3 = (await createWorkspace(db3, "hr_responds")).id;
    await jumpToChapter(db3, ws3, 5);
    const before = await buildViewModel(db3, ws3, OFFLINE);
    expect(before.week1.suggestion?.booked).toBe(false);
    await bookWalkthrough(db3, ws3, ANAND, deps);
    await bookWalkthrough(db3, ws3, ANAND, deps);
    const booked = await db3.select().from(calendarEvents).where(and(eq(calendarEvents.workspaceId, ws3), eq(calendarEvents.kind, "walkthrough")));
    expect(booked).toHaveLength(1);
    expect((await toolLog(db3, ws3)).filter((c) => c.tool === "schedule_meeting" && c.argsSummary.includes("Roadmap walkthrough"))).toHaveLength(1);
    const after = await buildViewModel(db3, ws3, OFFLINE);
    expect(after.week1.suggestion).toMatchObject({ booked: true });
    expect(await failedEvents(db3, ws3)).toHaveLength(0);
  });
});

describe("advance time for the presenter", () => {
  it("skips quiet daily checks and stops at the first thing the joiner would notice", async () => {
    const db4 = await createMemoryDb();
    const ws4 = (await createWorkspace(db4, "hr_responds")).id;
    await jumpToChapter(db4, ws4, 2);
    const processed = await advanceStory(db4, ws4, deps);
    expect(processed.at(-1)?.type).toBe("navo.daily_check");
    expect((await taskByKey(db4, ws4, "employee_id")).riskLevel).toMatch(/high|critical/);
  });
});
