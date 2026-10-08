import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { dependencies, events, policySections, tasks, workspaces } from "@/lib/db/schema";
import { createWorkspace, resetWorkspace } from "@/services/workspace";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

describe("workspace seeding", () => {
  it("creates an isolated workspace with the synthetic Halden dataset", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    const taskRows = await db.select().from(tasks).where(eq(tasks.workspaceId, ws.id));
    const depRows = await db.select().from(dependencies).where(eq(dependencies.workspaceId, ws.id));
    const scheduled = await db.select().from(events).where(eq(events.workspaceId, ws.id));
    const sections = await db.select().from(policySections);

    expect(ws.simNow.toISOString()).toBe("2026-10-07T12:30:00.000Z");
    expect(taskRows.filter((t) => t.employeeId === "anand.mehta")).toHaveLength(27);
    expect(depRows.length).toBeGreaterThan(14 * 20);
    expect(scheduled.map((e) => e.type)).toContain("navo.daily_check");
    expect(sections.length).toBeGreaterThan(15);
  });

  it("reset rebuilds the same workspace id from seed", async () => {
    const ws = await createWorkspace(db, "hr_responds");
    const reset = await resetWorkspace(db, ws.id, "hr_silent");
    expect(reset.id).toBe(ws.id);
    expect(reset.scenario).toBe("hr_silent");
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(rows).toHaveLength(1);
  });
});
