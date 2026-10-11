/**
 * Builds real view models from the engine once per test run (in Node, on in-memory
 * Postgres), so component tests render screens with the data the app actually shows.
 */
import type { TestProject } from "vitest/node";
import { advance } from "@/agent/runtime";
import { createMemoryDb } from "@/lib/db/client";
import { buildViewModel } from "@/server/respond";
import { advanceStory, jumpToChapter, jumpToDay30 } from "@/services/demo-director";
import { OFFLINE } from "@/services/llm/gateway";
import type { ViewModel } from "@/services/view-model/types";
import { createWorkspace } from "@/services/workspace";
import { templateNarrator } from "@/agent/narration";
import { fixtureReader } from "@/services/documents/reader";

declare module "vitest" {
  export interface ProvidedContext {
    viewModels: Record<string, ViewModel>;
  }
}

const deps = { narrator: templateNarrator, reader: fixtureReader };

export default async function setup(project: TestProject) {
  const db = await createMemoryDb();
  const vms: Record<string, ViewModel> = {};
  const responds = (await createWorkspace(db, "hr_responds")).id;
  vms.documents = await buildViewModel(db, responds, OFFLINE);
  const silent = (await createWorkspace(db, "hr_silent")).id;
  await jumpToChapter(db, silent, 2);
  await advance(db, silent, deps);
  vms.risk = await buildViewModel(db, silent, OFFLINE);
  for (let i = 0; i < 6 && !(await buildViewModel(db, silent, OFFLINE)).pendingApproval; i++) await advanceStory(db, silent, deps);
  vms.approval = await buildViewModel(db, silent, OFFLINE);
  for (const [name, chapter] of [["ready", 3], ["day1", 4], ["week1", 5]] as const) {
    await jumpToChapter(db, responds, chapter);
    vms[name] = await buildViewModel(db, responds, OFFLINE);
  }
  await jumpToDay30(db, responds);
  vms.day30 = await buildViewModel(db, responds, OFFLINE);
  project.provide("viewModels", vms);
}
