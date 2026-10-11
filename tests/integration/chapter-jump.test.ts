import { describe, expect, it } from "vitest";
import { advance } from "@/agent/runtime";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { advanceStory, jumpToChapter, skipAhead } from "@/services/demo-director";
import { completeTraining, hrGenerateEmployeeId } from "@/services/employee-actions";
import { OFFLINE } from "@/services/llm/gateway";
import { aiStatus } from "@/services/llm/usage";
import { loadState } from "@/services/view-model/load";
import { present } from "@/services/view-model/present";
import { createWorkspace } from "@/services/workspace";
import { ANAND, completeDocumentsChapter, deps } from "./helpers";

const view = async (db: Db, ws: string) => present(await loadState(db, ws), { ai: await aiStatus(db, ws, OFFLINE, true) });

/** The guided demo's own steps up to the pickup, as its beats run them (a jump keeps the laptop on time, without the IT delay). */
async function tourToPickup(db: Db, ws: string) {
  await completeDocumentsChapter(db, ws);
  await skipAhead(db, ws, "risk_day");
  await advanceStory(db, ws, deps);
  await hrGenerateEmployeeId(db, ws, ANAND, deps);
  await completeTraining(db, ws, ANAND, deps);
  for (let i = 0; i < 8 && !(await view(db, ws)).day1.pickup; i++) await advance(db, ws, deps);
}

describe("chapter jumps", () => {
  it("start the Ready for Day 1 chapter where the guided demo has it, with the training already done", async () => {
    const db = await createMemoryDb();
    const toured = (await createWorkspace(db, "hr_responds")).id;
    const jumped = (await createWorkspace(db, "hr_responds")).id;
    await tourToPickup(db, toured);
    await jumpToChapter(db, jumped, 3);
    const [a, b] = [await view(db, toured), await view(db, jumped)];
    expect(b.home.needs.map((n) => n.title)).toEqual([]);
    expect(b.home.needs).toEqual(a.home.needs);
    expect(Boolean(b.day1.pickup)).toBe(true);
    expect({ byYou: b.impact.byYou, tasksDone: b.impact.tasksDone }).toEqual({ byYou: a.impact.byYou, tasksDone: a.impact.tasksDone });
  });
});
