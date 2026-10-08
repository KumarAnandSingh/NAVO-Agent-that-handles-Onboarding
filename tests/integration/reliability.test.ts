import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { startRun } from "@/agent/context";
import { templateNarrator } from "@/agent/narration";
import { advance, processDue } from "@/agent/runtime";
import { escalateOwner } from "@/agent/tools";
import { callTool, defineTool, ToolDeniedError, ToolTimeoutError, ToolValidationError } from "@/agent/tools/registry";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { events, followUps, toolCalls } from "@/lib/db/schema";
import { enqueueEvent } from "@/services/events/queue";
import { ConflictError, getTask, updateTask } from "@/services/onboarding-state/repository";
import { searchPolicies } from "@/services/policy-retrieval";
import { createWorkspace, requireWorkspace } from "@/services/workspace";
import { hrGenerateEmployeeId } from "@/services/employee-actions";
import { ANAND, deps, taskByKey, toThursdayMorning } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

async function newContext() {
  const ws = await createWorkspace(db, "hr_responds");
  const ctx = await startRun(db, ws, ANAND, "test", ws.simNow, templateNarrator);
  return { ws, ctx };
}

async function auditRows(ws: string) {
  return db.select().from(toolCalls).where(eq(toolCalls.workspaceId, ws));
}

describe("tool reliability", () => {
  it("rejects invalid tool input deterministically and audits it", async () => {
    const { ws, ctx } = await newContext();
    await expect(callTool(ctx, escalateOwner, { taskId: 42 })).rejects.toBeInstanceOf(ToolValidationError);
    const [row] = await auditRows(ws.id);
    expect(row).toMatchObject({ tool: "escalate_owner", status: "error" });
    expect(row?.resultSummary).toMatch(/invalid input/);
  });

  it("times out a slow tool and records the timeout", async () => {
    const { ws, ctx } = await newContext();
    const slow = defineTool({
      name: "slow_lookup",
      description: "test",
      guard: "read",
      input: z.object({}),
      summarizeArgs: () => "",
      timeoutMs: 50,
      run: () => new Promise<{ summary: string; data: null }>((resolve) => setTimeout(() => resolve({ summary: "late", data: null }), 500)),
    });
    await expect(callTool(ctx, slow, {})).rejects.toBeInstanceOf(ToolTimeoutError);
    expect((await auditRows(ws.id))[0]).toMatchObject({ status: "timeout", resultSummary: "timed out" });
  });

  it("denies an escalation before the 24-hour window and records the denial", async () => {
    const { ws, ctx } = await newContext();
    await db.insert(followUps).values({
      workspaceId: ws.id,
      id: "R-9",
      employeeId: ANAND,
      taskId: `${ANAND}/employee_id`,
      kind: "reminder",
      toPersonId: "priya.nair",
      message: "test reminder message",
      sentAt: ws.simNow,
      slaDueAt: new Date(ws.simNow.getTime() + 86_400_000),
      status: "open",
    });
    await expect(
      callTool(ctx, escalateOwner, {
        taskId: `${ANAND}/employee_id`,
        followUpId: "R-9",
        toPersonId: "neha.kapoor",
        ccPersonId: "priya.nair",
        message: "escalation message text",
      }),
    ).rejects.toBeInstanceOf(ToolDeniedError);
    expect((await auditRows(ws.id))[0]).toMatchObject({ status: "denied", guard: "denied" });
  });
});

describe("state and event reliability", () => {
  it("rejects a conflicting update made from a stale version", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    const task = await getTask(db, ws.id, `${ANAND}/onboarding_kit`);
    await updateTask(db, task, { statusNote: "first writer" }, { actor: "test", at: ws.simNow });
    await expect(updateTask(db, task, { statusNote: "second writer" }, { actor: "test", at: ws.simNow })).rejects.toBeInstanceOf(ConflictError);
  });

  it("ignores a duplicate delivery of the same event", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    const event = { type: "vendor.check_cleared", source: "vendor", label: "dup", dueAt: ws.simNow, idempotencyKey: "dup-1", payload: { employeeId: ANAND, checkId: `${ANAND}/bgv` } };
    expect(await enqueueEvent(db, ws.id, event)).not.toBeNull();
    expect(await enqueueEvent(db, ws.id, event)).toBeNull();
  });

  it("treats a second Employee ID notification as a no-op", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    await toThursdayMorning(db, ws.id);
    await hrGenerateEmployeeId(db, ws.id, ANAND, deps);
    expect((await taskByKey(db, ws.id, "employee_id")).status).toBe("completed");
    // HR's own scheduled response later arrives too; it must not raise requests twice.
    await enqueueEvent(db, ws.id, {
      type: "hr.employee_id_issued",
      source: "hr",
      label: "late duplicate",
      dueAt: (await requireWorkspace(db, ws.id)).simNow,
      idempotencyKey: "late-duplicate",
      payload: { employeeId: ANAND, employeeNumber: "EMP-204817", issuedBy: "priya.nair" },
    });
    const processed = await processDue(db, ws.id, (await requireWorkspace(db, ws.id)).simNow, deps);
    expect(processed.at(-1)?.outcome).toBe("ignored");
  });

  it("isolates a failing event (missing employee) so the queue keeps moving", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    await enqueueEvent(db, ws.id, {
      type: "vendor.check_cleared",
      source: "vendor",
      label: "bad",
      dueAt: ws.simNow,
      idempotencyKey: "missing-employee",
      payload: { employeeId: "nobody", checkId: "x" },
    });
    const processed = await processDue(db, ws.id, ws.simNow, deps);
    expect(processed[0]).toMatchObject({ outcome: "failed" });
    const [row] = await db.select().from(events).where(and(eq(events.workspaceId, ws.id), eq(events.idempotencyKey, "missing-employee")));
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/not found/);
    const next = await advance(db, ws.id, deps);
    expect(next.processed.length).toBeGreaterThan(0);
  });

  it("finds no policy for an unrelated question instead of guessing", async () => {
    expect(await searchPolicies(db, "quantum teleportation allowance", { asOf: new Date("2026-10-15T04:00:00Z") })).toEqual([]);
  });
});
