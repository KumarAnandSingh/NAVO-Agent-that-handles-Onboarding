import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { approvals } from "@/lib/db/schema";
import { advanceStory, injectItDelay, jumpToChapter, jumpToDay30, reset, setScenario, skipAhead } from "@/services/demo-director";
import { bookWalkthrough, completeTraining, confirmPickup, decideApproval, enrolBenefits, recordPulse } from "@/services/employee-actions";
import { OFFLINE } from "@/services/llm/gateway";
import type { ViewModel } from "@/services/view-model/types";
import { buildViewModel } from "@/server/respond";
import { createWorkspace } from "@/services/workspace";
import { ANAND, deps, failedEvents } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

const CHAPTERS: ViewModel["chapter"][] = ["documents", "pre_joining", "ready", "day1", "week1"];
const BROKEN_COPY = /undefined|NaN|\[object Object\]|Invalid Date/;

/** Every string the screens show, with the path to it, so a broken one is easy to find. */
function strings(value: unknown, path = "vm"): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

async function checkedView(ws: string): Promise<ViewModel> {
  const vm = await buildViewModel(db, ws, OFFLINE);
  const broken = strings(vm).filter(([, s]) => BROKEN_COPY.test(s));
  expect(broken).toEqual([]);
  expect(vm.home.headline.length).toBeGreaterThan(0);
  expect(await failedEvents(db, ws)).toHaveLength(0);
  return vm;
}

async function approvePending(ws: string, decision: "approved" | "declined") {
  const pending = await db.select().from(approvals).where(and(eq(approvals.workspaceId, ws), eq(approvals.status, "pending"), eq(approvals.requestedFrom, ANAND)));
  for (const a of pending) await decideApproval(db, ws, ANAND, a.id, decision, deps);
  return pending.length;
}

// Each sweep replays the story many times; under coverage instrumentation that takes a while.
const SLOW = 120_000;

describe("journey sweep", () => {
  for (const scenario of ["hr_responds", "hr_silent"] as const) {
    it(`walks the ${scenario} story event by event with sound screens and no backwards chapters`, async () => {
      const ws = (await createWorkspace(db, scenario)).id;
      await jumpToChapter(db, ws, 2);
      let previous = CHAPTERS.indexOf((await checkedView(ws)).chapter);
      const seen = new Set<string>();
      for (let step = 0; step < 40; step++) {
        const processed = await advanceStory(db, ws, deps);
        await approvePending(ws, "approved");
        const vm = await checkedView(ws);
        seen.add(vm.chapter);
        const index = CHAPTERS.indexOf(vm.chapter);
        expect(index).toBeGreaterThanOrEqual(previous);
        previous = index;
        if (processed.length === 0) break;
      }
      expect(seen.has("ready") || seen.has("day1") || seen.has("week1")).toBe(true);
    }, SLOW);
  }

  it("respects the joiner declining the loaner, and survives an IT slip", async () => {
    const ws = (await createWorkspace(db, "hr_silent")).id;
    await jumpToChapter(db, ws, 2);
    for (let i = 0; i < 6 && (await approvePending(ws, "declined")) === 0; i++) await advanceStory(db, ws, deps);
    // A "no" stands: Navo keeps chasing the real laptop and doesn't ask about the loaner again.
    for (let i = 0; i < 4; i++) await advanceStory(db, ws, deps);
    const declined = await checkedView(ws);
    expect(declined.pendingApproval).toBeNull();
    const asked = await db.select().from(approvals).where(and(eq(approvals.workspaceId, ws), eq(approvals.action, "request_loaner")));
    expect(asked.map((a) => a.status)).toEqual(["declined"]);

    await setScenario(db, ws, "hr_responds");
    expect(await injectItDelay(db, ws, deps)).toBe(true);
    for (const to of ["risk_day", "day1"] as const) {
      await skipAhead(db, ws, to);
      await checkedView(ws);
    }
  }, SLOW);

  it("covers a partial pickup, double taps and the later weeks", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    await jumpToChapter(db, ws, 4);
    await skipAhead(db, ws, "pickup");
    await checkedView(ws);
    await completeTraining(db, ws, ANAND, deps);
    await confirmPickup(db, ws, ANAND, ["id"], deps);
    // A second tap on the same pickup changes nothing.
    await confirmPickup(db, ws, ANAND, ["id"], deps);
    const partial = await checkedView(ws);
    expect(partial.day1.wrapUp.length).toBeGreaterThan(0);

    for (const to of ["day1_end", "week1"] as const) {
      await skipAhead(db, ws, to);
      await checkedView(ws);
    }
    await enrolBenefits(db, ws, ANAND, deps);
    await enrolBenefits(db, ws, ANAND, deps);
    await bookWalkthrough(db, ws, ANAND, deps);
    await recordPulse(db, ws, ANAND, 4);
    await jumpToDay30(db, ws);
    expect((await checkedView(ws)).chapter).toBe("week1");
  }, SLOW);

  it("builds every chapter of both scenarios straight from a reset", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    for (const scenario of ["hr_responds", "hr_silent"] as const) {
      await reset(db, ws, scenario);
      for (const chapter of [0, 1, 2, 3, 4, 5]) {
        await jumpToChapter(db, ws, chapter);
        const vm = await checkedView(ws);
        expect(CHAPTERS).toContain(vm.chapter);
      }
    }
  }, SLOW);
});
