/**
 * AI quality benchmark.
 *
 *   npm run eval              offline: grades Navo's rule-based fallbacks (free, what CI runs)
 *   npm run eval -- --live    with ANTHROPIC_API_KEY: grades Claude through the real gateway
 *   npm run eval -- --json    also write the full report to evals/<mode>.json
 *
 * Runs on a fresh in-memory database. A live run makes about 40 Claude calls; the report
 * prints its estimated cost at list price.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createMemoryDb } from "../src/lib/db/client";
import { runEval, summarise, toMarkdown } from "../src/eval/run";
import { gateway, serverAccess } from "../src/services/llm/gateway";

async function main() {
  const live = process.argv.includes("--live");
  const llm = live ? gateway(serverAccess()) : null;
  if (live && !llm) throw new Error("A live run needs ANTHROPIC_API_KEY (and NAVO_LIVE_AI not set to off).");
  const report = await runEval(await createMemoryDb(), llm);
  console.log(toMarkdown(report));
  if (process.argv.includes("--json")) {
    const dir = path.join(process.cwd(), "evals");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${report.mode}.json`), JSON.stringify(report, null, 2));
  }
  // Offline, every case except the paraphrases must pass: the rules are deterministic.
  const failing = report.results.filter((r) => !r.pass && !(report.mode === "offline" && r.paraphrase));
  const summary = summarise(report);
  if (failing.length) {
    console.error(`${failing.length} case(s) failed: ${failing.map((r) => `${r.suite}/${r.id}`).join(", ")}`);
    process.exitCode = 1;
  } else console.error(`ok: ${summary.map((s) => `${s.suite} ${s.passed}/${s.cases}`).join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
