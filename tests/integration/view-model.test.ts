import { beforeAll, describe, expect, it } from "vitest";
import { advance } from "@/agent/runtime";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { jumpToChapter, jumpToDay30 } from "@/services/demo-director";
import { loadState } from "@/services/view-model/load";
import { present } from "@/services/view-model/present";
import { createWorkspace } from "@/services/workspace";
import { deps, failedEvents } from "./helpers";

let db: Db;
let ws: string;
const view = async () => present(await loadState(db, ws), { liveAI: false, model: null });

beforeAll(async () => {
  db = await createMemoryDb();
  ws = (await createWorkspace(db, "hr_responds")).id;
});

describe("view model", () => {
  it("opens on the documents chapter with the missing address proof as the next best action", async () => {
    const vm = await view();
    expect(vm.chapter).toBe("documents");
    expect(vm.documents.head).toBe("Your address proof is missing.");
    expect(vm.documents.cta.action).toBe("upload_address");
    expect(vm.forms.missing).toBe(2);
    expect(vm.employee).toMatchObject({ name: "Anand Mehta", initials: "AM", day1: "Mon 19 Oct" });
  });

  it("shows the pre-joining home on Thursday morning", async () => {
    await jumpToChapter(db, ws, 2);
    const vm = await view();
    expect(vm.chapter).toBe("pre_joining");
    expect(vm.clock.dayClock).toBe("Thu 15 Oct · 09:00");
    expect(vm.home.headline).toBe("You join Halden in 4 days. I've handled most of it.");
    expect(vm.home.needs.map((n) => n.title)).toEqual(["Security training"]);
    expect(vm.home.watch?.title).toBe("Employee ID");
    expect(vm.runtime.upcoming[0]?.label).toBe("Navo daily check");
  });

  it("reflects the Day-1 risk after Navo acts, including the runtime trace", async () => {
    await advance(db, ws, deps);
    const vm = await view();
    expect(vm.home.headline).toBe("One risk to Monday. I'm on it.");
    expect(vm.home.face).toBe("concerned");
    expect(vm.home.watch).toMatchObject({ tone: "risk", title: "Laptop may miss Day 1" });
    expect(vm.home.did[0]).toMatchObject({ title: "Followed up with HR", fresh: true, icon: "navo" });
    expect(vm.runtime.runs[0]?.tools.map((t) => t.fn)).toContain("send_reminder");
    expect(vm.runtime.runs[0]?.diff).toEqual(expect.arrayContaining(["day1_risk: medium → high", "reminder R-1: created", "laptop: blocked → at_risk"]));
    expect(vm.hr.queue[0]).toMatchObject({ title: "Employee ID not generated", action: "generate_id" });
    expect(vm.idTracker.kicker).toBe("POTENTIAL DELAY DETECTED");
  });

  it("replays every chapter through the real engine without failures", async () => {
    for (const chapter of [3, 4, 5]) {
      await jumpToChapter(db, ws, chapter);
      expect(await failedEvents(db, ws)).toHaveLength(0);
    }
    const vm = await view();
    expect(vm.chapter).toBe("week1");
    expect(vm.week1.doneCount).toBeGreaterThanOrEqual(4);
    expect(vm.week1.benefits?.open).toBe(true);
    await jumpToDay30(db, ws);
    expect((await view()).day30.checkIn).toMatch(/Thu 19 Nov, 11:00/);
  });
});
