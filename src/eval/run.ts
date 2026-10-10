/**
 * Runs the AI quality benchmark: Ask Navo on the golden questions, document reading on the
 * synthetic samples, and status updates of every kind. With no Claude it measures Navo's
 * rule-based fallbacks (what CI runs); with a key it measures Claude through the real
 * gateway, guard and verification, and reports latency and cost from the usage log.
 */
import { claudeNarrator, keepsFacts } from "@/agent/claude-narrator";
import { templateNarrator, templateUpdate } from "@/agent/narration";
import { advance } from "@/agent/runtime";
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import type { Db } from "@/lib/db/client";
import { askNavo } from "@/services/ask";
import { jumpToChapter } from "@/services/demo-director";
import { claudeReader } from "@/services/documents/claude-reader";
import { fixtureReader } from "@/services/documents/reader";
import type { Llm } from "@/services/llm/gateway";
import { aiStatus } from "@/services/llm/usage";
import type { AiStatusVM } from "@/services/view-model/types";
import { createWorkspace } from "@/services/workspace";
import { ASK_CASES, NARRATION_CASES, type AskCase } from "./cases";
import { gradeAsk, gradeReading, type Check } from "./grade";

export interface CaseResult {
  suite: "ask" | "documents" | "narration";
  id: string;
  input: string;
  output: string;
  /** Who produced the output: Claude, or Navo's rules after a fallback. */
  by: string;
  latencyMs: number;
  checks: Check[];
  pass: boolean;
  /** The offline fallback is not expected to pass this one. */
  paraphrase?: boolean;
}

export interface EvalReport {
  mode: "offline" | "live";
  results: CaseResult[];
  usage: Pick<AiStatusVM, "usage" | "totalCostUsd" | "masked">;
}

const OFFLINE_DEPS = { narrator: templateNarrator, reader: fixtureReader };

async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await work();
  return [value, Math.round(performance.now() - started)];
}

function result(r: Omit<CaseResult, "pass">): CaseResult {
  return { ...r, pass: r.checks.every((c) => c.pass) };
}

/** The Ask state: HR-silent story, Thursday 09:15, Navo has just reminded HR. */
async function askWorkspace(db: Db): Promise<string> {
  const ws = (await createWorkspace(db, "hr_silent")).id;
  await jumpToChapter(db, ws, 2);
  await advance(db, ws, OFFLINE_DEPS);
  return ws;
}

export async function runEval(db: Db, llm: Llm | null, cases: AskCase[] = ASK_CASES): Promise<EvalReport> {
  const results: CaseResult[] = [];
  const askWs = await askWorkspace(db);
  for (const c of cases) {
    const [answer, latencyMs] = await timed(() => askNavo(db, askWs, c.question, { llm }));
    results.push(
      result({
        suite: "ask",
        id: c.id,
        input: c.question,
        output: answer.text,
        by: answer.composedBy === "claude" ? (answer.model ?? "claude") : `rules (${answer.fallbackReason ?? "fallback"})`,
        latencyMs,
        checks: gradeAsk(c, answer),
        paraphrase: c.paraphrase,
      }),
    );
  }

  const docWs = (await createWorkspace(db, "hr_responds")).id;
  const reader = llm ? claudeReader(llm) : fixtureReader;
  for (const sample of SAMPLE_DOCUMENTS) {
    const [reading, latencyMs] = await timed(() => reader.read(sample, { db, workspaceId: docWs }));
    results.push(
      result({
        suite: "documents",
        id: sample.id,
        input: sample.label,
        output: reading.fields.map((f) => `${f.name}=${f.value || f.raw || "?"}`).join("; "),
        by: reading.readBy,
        latencyMs,
        checks: gradeReading(sample.expected, reading.fields),
      }),
    );
  }

  const narrator = llm ? claudeNarrator(llm) : templateNarrator;
  for (const update of NARRATION_CASES) {
    const [narration, latencyMs] = await timed(() => narrator.employeeUpdate(update, { db, workspaceId: docWs }));
    const checks: Check[] = [{ name: "keeps every fact", pass: narration.composedBy === "template" ? narration.text === templateUpdate(update) : keepsFacts(update, narration.text) }];
    results.push(result({ suite: "narration", id: update.kind, input: templateUpdate(update), output: narration.text, by: narration.composedBy, latencyMs, checks }));
  }

  const status = await Promise.all([aiStatus(db, askWs, { mode: "offline" }, false), aiStatus(db, docWs, { mode: "offline" }, false)]);
  const usage = status.flatMap((s) => s.usage);
  return {
    mode: llm ? "live" : "offline",
    results,
    usage: { usage, totalCostUsd: status.reduce((n, s) => n + s.totalCostUsd, 0), masked: status.reduce((n, s) => n + s.masked, 0) },
  };
}

export interface SuiteSummary {
  suite: CaseResult["suite"];
  cases: number;
  passed: number;
  /** Outputs Claude wrote (the rest came from Navo's rules). */
  byClaude: number;
  avgLatencyMs: number;
}

export function summarise(report: EvalReport): SuiteSummary[] {
  return (["ask", "documents", "narration"] as const).map((suite) => {
    const rows = report.results.filter((r) => r.suite === suite);
    return {
      suite,
      cases: rows.length,
      passed: rows.filter((r) => r.pass).length,
      byClaude: rows.filter((r) => r.by.startsWith("claude")).length,
      avgLatencyMs: rows.length ? Math.round(rows.reduce((n, r) => n + r.latencyMs, 0) / rows.length) : 0,
    };
  });
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");

/** The report as Markdown, for the console and docs/AI_QUALITY.md. */
export function toMarkdown(report: EvalReport): string {
  const lines = [
    `### ${report.mode === "live" ? "Live Claude" : "Offline (Navo's rules, no AI)"}`,
    "",
    "| Suite | Cases | Passed | Written by Claude | Avg latency |",
    "|---|---|---|---|---|",
    ...summarise(report).map((s) => `| ${s.suite} | ${s.cases} | ${s.passed} (${pct(s.passed, s.cases)}) | ${s.byClaude} | ${s.avgLatencyMs} ms |`),
    "",
  ];
  if (report.mode === "live") {
    lines.push(`Estimated cost of this run at list price: $${report.usage.totalCostUsd.toFixed(4)}. Personal numbers masked: ${report.usage.masked}.`, "");
    for (const u of report.usage.usage) lines.push(`- ${u.label} on ${u.model}: ${u.calls} calls, ${u.failed} fell back, avg ${u.avgLatencyMs ?? "?"} ms, $${(u.costUsd ?? 0).toFixed(4)}`);
    lines.push("");
  }
  const failed = report.results.filter((r) => !r.pass);
  if (failed.length) {
    lines.push("| Failed case | Check | Output |", "|---|---|---|");
    for (const r of failed) {
      const why = r.checks.filter((c) => !c.pass).map((c) => (c.detail ? `${c.name} (${c.detail})` : c.name));
      lines.push(`| ${r.suite}/${r.id}${r.paraphrase ? " (paraphrase)" : ""} | ${why.join("; ")} | ${r.output.replace(/\|/g, "/").slice(0, 160)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
