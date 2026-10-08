import { beforeAll, describe, expect, it } from "vitest";
import { advance } from "@/agent/runtime";
import { formatDayClock } from "@/domain/time";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { decideApproval } from "@/services/employee-actions";
import { createWorkspace } from "@/services/workspace";
import { activityLog, approvalRows, deps, failedEvents, followUpRows, taskByKey, ticketRows, toThursdayMorning } from "./helpers";

let db: Db;
let ws: string;

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_silent")).id;
  await toThursdayMorning(db, ws);
});

describe("golden path: HR stays silent", () => {
  it("reminds HR at 09:17 and plans the fallback", async () => {
    await advance(db, ws, deps);
    const planned = (await activityLog(db, ws)).find((a) => a.phase === "Planned");
    expect(planned?.summary).toMatch(/No ID by 12:00 → offer you a loaner laptop/);
  });

  it("asks Anand about a loaner at the last safe start, because a laptop is an asset change", async () => {
    const result = await advance(db, ws, deps);
    expect(formatDayClock(result.to)).toBe("Thu 15 Oct · 12:00");
    const [approval] = await approvalRows(db, ws);
    expect(approval).toMatchObject({ action: "request_loaner", status: "pending", requestedFrom: "anand.mehta" });
    // The offer quotes the time IT will actually commit to.
    expect(approval?.detail).toBe("IT can have one ready at Building B by Fri 16:00, in time for your Day 1 pickup. Your own laptop follows.");
    expect(await ticketRows(db, ws)).toHaveLength(0);
  });

  it("only reserves the loaner after Anand approves, and a double tap changes nothing", async () => {
    const [approval] = await approvalRows(db, ws);
    await decideApproval(db, ws, "anand.mehta", approval!.id, "approved", deps);
    await decideApproval(db, ws, "anand.mehta", approval!.id, "approved", deps);
    const tickets = await ticketRows(db, ws);
    expect(tickets.map((t) => t.type)).toEqual(["loaner"]);
  });

  it("escalates to HR Ops when the reminder goes unanswered for 24 hours", async () => {
    for (let i = 0; i < 4; i++) await advance(db, ws, deps);
    const followUps = await followUpRows(db, ws);
    expect(followUps.find((f) => f.kind === "reminder")?.status).toBe("breached");
    expect(followUps.find((f) => f.kind === "escalation")).toMatchObject({ toPersonId: "neha.kapoor", ccPersonId: "priya.nair" });
  });

  it("recovers: HR Ops issues the ID, the loaner covers Day 1 and one pickup is booked", async () => {
    for (let i = 0; i < 8; i++) await advance(db, ws, deps);
    expect((await taskByKey(db, ws, "employee_id")).status).toBe("completed");
    expect((await taskByKey(db, ws, "laptop")).status).toBe("completed");
    expect((await taskByKey(db, ws, "pickup")).status).toBe("completed");
    expect((await ticketRows(db, ws)).map((t) => t.type).sort()).toEqual(["email", "laptop", "loaner", "vpn"]);
    expect(await failedEvents(db, ws)).toHaveLength(0);
  });
});
