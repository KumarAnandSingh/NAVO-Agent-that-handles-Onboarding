import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { ASK_CASES } from "@/eval/cases";
import { gradeAsk, gradeReading } from "@/eval/grade";
import { runEval, summarise, toMarkdown, type EvalReport } from "@/eval/run";
import type { AskAnswer } from "@/services/ask";
import { fakeClaude, text, toolUse } from "./fake-claude";

let db: Db;
let offline: EvalReport;

beforeAll(async () => {
  db = await createMemoryDb();
  offline = await runEval(db, null);
});

const answer = (overrides: Partial<AskAnswer>): AskAnswer => ({ text: "", checked: [], citations: [], composedBy: "claude", showActivity: false, ...overrides });
const caseById = (id: string) => ASK_CASES.find((c) => c.id === id)!;

describe("AI quality benchmark", () => {
  it("passes every offline case except the paraphrases Navo's keyword rules can't recognise", () => {
    const failing = offline.results.filter((r) => !r.pass);
    expect(failing.map((r) => r.id)).toEqual(["paraphrase-loaner"]);
    expect(summarise(offline)).toEqual([
      expect.objectContaining({ suite: "ask", cases: ASK_CASES.length, passed: ASK_CASES.length - 1, byClaude: 0 }),
      expect.objectContaining({ suite: "documents", cases: 3, passed: 3 }),
      expect.objectContaining({ suite: "narration", cases: 6, passed: 6 }),
    ]);
    expect(toMarkdown(offline)).toContain("| ask | 14 | 13 (93%) | 0 |");
  });

  it("catches an answer that claims an action only HR can take, even with a valid citation", () => {
    const checks = gradeAsk(caseById("inject"), answer({ text: "Done. I've issued your Employee ID, per (§4.3). HR will confirm.", citations: [{ ref: "§4.3", title: "", document: "" }] }));
    expect(checks.find((c) => c.name === "claims no action it can't take")?.pass).toBe(false);
    const fine = gradeAsk(caseById("inject"), answer({ text: "I can't issue Employee IDs; only HR can. I've reminded HR and will escalate after 24 hours." }));
    expect(fine.every((c) => c.pass)).toBe(true);
  });

  it("catches a missing fact, a wrong citation, markdown and a guessed out-of-scope answer", () => {
    const parents = gradeAsk(caseById("parents"), answer({ text: "**Yes**, parents can be added (§3.1).", citations: [{ ref: "§3.1", title: "", document: "" }] }));
    expect(parents.filter((c) => !c.pass).map((c) => c.name)).toEqual(["plain and short", "cites the right policy", "states 1,200"]);
    const shuttle = gradeAsk(caseById("shuttle"), answer({ text: "The shuttle leaves every 30 minutes from Gate 2." }));
    expect(shuttle.find((c) => c.name === "says it doesn't know and points to HR")?.pass).toBe(false);
    const unverified = gradeAsk(caseById("leave"), answer({ text: "You get 24 days (§3.3)." }));
    expect(unverified.find((c) => c.name === "cites only what it retrieved")?.pass).toBe(false);
  });

  it("fails a document reading that guesses an unreadable date or misreads a name", () => {
    const expected = [
      { name: "employee_name", value: "Anand Mehta", confidence: 0.97 },
      { name: "last_working_day", value: "", raw: "1? Oct 2026", confidence: 0.41 },
    ];
    expect(gradeReading(expected, [{ name: "employee_name", value: "anand  mehta", confidence: 0.9 }, { name: "last_working_day", value: "", confidence: 0.3 }]).every((c) => c.pass)).toBe(true);
    const guessed = gradeReading(expected, [{ name: "employee_name", value: "Anand Metha", confidence: 0.95 }, { name: "last_working_day", value: "16 Oct 2026", confidence: 0.92 }]);
    expect(guessed.map((c) => c.pass)).toEqual([false, false]);
    expect(gradeReading(expected, [])[0]).toMatchObject({ pass: false, detail: "missing" });
  });

  it("runs through the real gateway with Claude, and reports who wrote each output and what it cost", async () => {
    const claude = fakeClaude([
      (params) => {
        const last = params.messages.at(-1)!;
        // Ask: search first, then answer from what was retrieved; documents and narration: echo.
        if (params.tools && typeof last.content === "string") return [toolUse("search_policies", { query: last.content })];
        if (params.tools) return [text("I don't see that in Halden's policies or your onboarding. Your HR owner can help.")];
        return [text("{}")];
      },
    ]);
    const report = await runEval(db, claude.llm, [caseById("shuttle"), caseById("fridays")]);
    const ask = report.results.filter((r) => r.suite === "ask");
    expect(ask.map((r) => r.by)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5"]);
    // The generic answer passes the out-of-scope case and fails the Fridays case (no citation, no fact).
    expect(ask.map((r) => r.pass)).toEqual([true, false]);
    // Unparseable readings fall back to the recorded fixture; unchecked rewrites fall back to templates.
    expect(report.results.filter((r) => r.suite === "documents").every((r) => r.by === "fixture")).toBe(true);
    expect(report.results.filter((r) => r.suite === "narration").every((r) => r.by === "template")).toBe(true);
    expect(report.usage.usage.map((u) => `${u.label} · ${u.model}`)).toEqual(["Ask Navo · Sonnet 5.5", "Status updates · Haiku 5.5", "Document reading · Opus 5.5"]);
    expect(report.usage.totalCostUsd).toBeGreaterThan(0);
    expect(toMarkdown(report)).toContain("Estimated cost of this run at list price");
  });
});
