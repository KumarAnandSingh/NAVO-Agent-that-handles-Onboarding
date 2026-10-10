import { beforeAll, describe, expect, it } from "vitest";
import { startRun, type AgentContext } from "@/agent/context";
import { templateNarrator } from "@/agent/narration";
import { advance } from "@/agent/runtime";
import { FEATURED_EMPLOYEE_ID } from "@/content/company";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { askNavo } from "@/services/ask";
import { ASK_TOOLS, ASK_TOOL_SPECS } from "@/services/ask/tools";
import { jumpToChapter } from "@/services/demo-director";
import { requireWorkspace, createWorkspace } from "@/services/workspace";
import { fakeClaude, text, toolUse } from "./fake-claude";
import { deps } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

async function context(ws: string): Promise<AgentContext> {
  const workspace = await requireWorkspace(db, ws);
  return startRun(db, workspace, FEATURED_EMPLOYEE_ID, "test", workspace.simNow, templateNarrator);
}

const run = async (ctx: AgentContext, name: string, input: unknown = {}) => {
  const tool = ASK_TOOLS[name]!;
  return tool.run(ctx, tool.input.parse(input));
};

describe("Ask Navo's read-only tools", () => {
  it("offers exactly the read tools, each with a schema", () => {
    expect(ASK_TOOL_SPECS.map((t) => t.name).sort()).toEqual([
      "calculate_day1_risk",
      "get_calendar",
      "get_dependencies",
      "get_employee_context",
      "get_follow_ups",
      "get_onboarding_state",
      "search_policies",
    ]);
  });

  it("reads a fresh joiner: nothing booked, no follow-ups, no risk driver", async () => {
    const ctx = await context((await createWorkspace(db, "hr_responds")).id);
    expect((await run(ctx, "get_onboarding_state")).content).toMatch(/^key \| name \| status/);
    expect((await run(ctx, "get_follow_ups")).content).toBe("No reminders, escalations or approvals yet.");
    expect((await run(ctx, "get_calendar")).content).toMatch(/Nothing booked yet\.|\|/);
    const profile = await run(ctx, "get_employee_context");
    expect(profile.content).toContain("name: Anand Mehta");
    expect(profile.content).toContain("family: married, 1 child");
    expect(profile.content).toContain("employee ID: not issued yet");
    expect((await run(ctx, "get_dependencies", { task: "laptop" })).content).toContain("waits on: employee_id");
    expect((await run(ctx, "get_dependencies", { task: "buddy" })).content).toMatch(/waits on: .*\nDay-1 items waiting on it: /);
    expect((await run(ctx, "search_policies", { query: "stock options vesting cliff" })).content).toBe("No relevant policy found.");
  });

  it("reads the Thursday state: the reminder, the risk driver and the last safe start", async () => {
    const ws = (await createWorkspace(db, "hr_silent")).id;
    await jumpToChapter(db, ws, 2);
    await advance(db, ws, deps);
    const ctx = await context(ws);
    expect((await run(ctx, "get_follow_ups")).content).toMatch(/reminder R-1 to Priya Nair about employee_id \| sent .* \| reply due .* \| open/);
    const risk = await run(ctx, "calculate_day1_risk");
    expect(risk.content).toContain("driver: laptop (high)");
    expect(risk.content).toMatch(/last safe start: Thu 15 Oct/);
    const policy = await run(ctx, "search_policies", { query: "escalation reminder 24 hours" });
    expect(policy.sections?.map((s) => s.ref)).toContain("Section 4.2");
  });

  it("reads the booked calendar once the pickup is arranged", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    await jumpToChapter(db, ws, 3);
    const ctx = await context(ws);
    expect((await run(ctx, "get_calendar")).content).toContain("Collect ID card, laptop, onboarding kit | Twin Tower · Building B");
    expect((await run(ctx, "calculate_day1_risk")).content).toMatch(/^(LOW|NONE)/);
  });

  it("rejects bad tool input and unknown tools without stopping the answer", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const claude = fakeClaude([
      [toolUse("get_dependencies", { task: "not_a_task" }, "t1"), toolUse("delete_everything", {}, "t2")],
      [text("I can only read your onboarding and Halden's policies. Your HR owner can help with anything else.")],
    ]);
    const answer = await askNavo(db, ws, "What depends on my laptop?", { llm: claude.llm });
    expect(answer.composedBy).toBe("claude");
    const results = claude.calls[1]!.messages.at(-1)!.content as { is_error?: boolean; content: string }[];
    expect(results.map((r) => [r.is_error, r.content.split(":")[0]])).toEqual([
      [true, "Invalid input"],
      [true, "Unknown tool delete_everything"],
    ]);
  });

  it("falls back when Claude stops for a reason other than an answer or a tool call", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const answer = await askNavo(db, ws, "What should I bring Monday?", { llm: fakeClaude([{ content: [text("…")], stop: "max_tokens" }]).llm });
    expect(answer.composedBy).toBe("fallback");
    expect(answer.fallbackReason).toBe("stopped: max_tokens");
  });

  it("falls back after too many tool rounds", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const answer = await askNavo(db, ws, "What should I bring Monday?", { llm: fakeClaude([[toolUse("get_calendar", {})]]).llm });
    expect(answer.fallbackReason).toBe("too many tool rounds");
  });

  it("rejects an empty or over-long answer from Claude", async () => {
    const ws = (await createWorkspace(db, "hr_responds")).id;
    const empty = await askNavo(db, ws, "What should I bring Monday?", { llm: fakeClaude([[text("   ")]]).llm });
    expect(empty.fallbackReason).toBe("empty answer");
    const long = await askNavo(db, ws, "What should I bring Monday?", { llm: fakeClaude([[text("word ".repeat(400))]]).llm });
    expect(long.fallbackReason).toBe("answer too long");
  });
});
