import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { startRun, type AgentContext } from "@/agent/context";
import { templateNarrator } from "@/agent/narration";
import { advance } from "@/agent/runtime";
import { calculateDay1Risk, checkSla, getCalendar, taskKeyOf, updateTaskTool } from "@/agent/tools";
import { callTool } from "@/agent/tools/registry";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { tasks, toolCalls } from "@/lib/db/schema";
import { jumpToChapter, jumpToDay30 } from "@/services/demo-director";
import { hrGenerateEmployeeId } from "@/services/employee-actions";
import { createWorkspace, requireWorkspace } from "@/services/workspace";
import { ANAND, deps } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

async function context(ws: string): Promise<AgentContext> {
  const workspace = await requireWorkspace(db, ws);
  return startRun(db, workspace, FEATURED_EMPLOYEE_ID, "test", workspace.simNow, templateNarrator);
}

const lastCall = async (ws: string) => (await db.select().from(toolCalls).where(eq(toolCalls.workspaceId, ws))).at(-1);

describe("agent tools at the edges", () => {
  it("audits a failing tool call before rethrowing it", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const ctx = await context(ws);
    await expect(callTool(ctx, checkSla, { followUpId: "R-404" })).rejects.toThrow("Reminder R-404 not found");
    expect(await lastCall(ws)).toMatchObject({ tool: "check_sla", status: "error", resultSummary: "error · Reminder R-404 not found" });
    await expect(callTool(ctx, updateTaskTool, { taskId: "anand.mehta/nope", status: "completed", note: null })).rejects.toThrow("not found");
    expect(taskKeyOf("no-slash")).toBe("no-slash");
  });

  it("updates only the note when a task is already in the requested state", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const ctx = await context(ws);
    const [laptop] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, ws), eq(tasks.id, `${ANAND}/laptop`)));
    await callTool(ctx, updateTaskTool, { taskId: laptop!.id, status: laptop!.status, note: "Still waiting on the Employee ID" });
    const [after] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, ws), eq(tasks.id, `${ANAND}/laptop`)));
    expect(after).toMatchObject({ status: laptop!.status, statusNote: "Still waiting on the Employee ID" });
  });

  it("reports an answered reminder, a ready Day 1 and an empty calendar", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    await jumpToChapter(db, ws, 2);
    await advance(db, ws, deps);
    await hrGenerateEmployeeId(db, ws, ANAND, deps);
    expect((await callTool(await context(ws), checkSla, { followUpId: "R-1" })).summary).toBe("answered");

    await jumpToChapter(db, ws, 4);
    expect((await callTool(await context(ws), calculateDay1Risk, { employeeId: ANAND })).summary).toMatch(/^(LOW|NONE)/);
    await jumpToDay30(db, ws);
    // After Day 1 there is no Day-1 risk left, only what is overdue.
    expect((await callTool(await context(ws), calculateDay1Risk, { employeeId: ANAND })).summary).toMatch(/^Day 1 has passed/);
    expect((await callTool(await context(ws), getCalendar, { employeeId: ANAND })).summary).toMatch(/upcoming · next/);
  });
});
