/**
 * Load test: many visitors use the demo at once, each in their own workspace.
 *
 *   npx tsx scripts/load-test.ts --base http://localhost:3200 --visitors 50
 *
 * Each visitor opens the app (which seeds a workspace), jumps to the pre-joining chapter,
 * advances time twice (the agent runs), asks Navo a question, has HR issue the Employee ID
 * and reloads the state. All visitors start together. Prints latency per step (p50, p95,
 * max) and fails if any request errors or any visitor sees another's workspace.
 */
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const BASE = arg("base", "http://localhost:3200");
const VISITORS = Number(arg("visitors", "50"));

type Step = { name: string; method: "GET" | "POST"; path: string; body?: unknown };
const STEPS: Step[] = [
  { name: "open app (seed workspace)", method: "GET", path: "/api/state" },
  { name: "jump to pre-joining", method: "POST", path: "/api/demo", body: { action: "chapter", chapter: 2 } },
  { name: "advance time (agent run)", method: "POST", path: "/api/demo", body: { action: "advance" } },
  { name: "advance time again", method: "POST", path: "/api/demo", body: { action: "advance" } },
  { name: "ask Navo", method: "POST", path: "/api/ask", body: { question: "What if HR doesn't respond?" } },
  { name: "HR issues the ID", method: "POST", path: "/api/hr", body: { action: "generate_id" } },
  { name: "reload state", method: "GET", path: "/api/state" },
];

interface Sample {
  step: string;
  ms: number;
  ok: boolean;
  detail?: string;
}

async function visitor(index: number): Promise<{ samples: Sample[]; workspace: string | null }> {
  let cookie = "";
  let workspace: string | null = null;
  const samples: Sample[] = [];
  for (const step of STEPS) {
    const started = performance.now();
    try {
      const response = await fetch(`${BASE}${step.path}`, {
        method: step.method,
        headers: { ...(step.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
        body: step.body ? JSON.stringify(step.body) : undefined,
      });
      const set = response.headers.getSetCookie().find((c) => c.startsWith("navo_ws="));
      if (set) cookie = set.split(";")[0]!;
      const json = (await response.json()) as { vm?: { workspace: { id: string } }; error?: string };
      const seen = json.vm?.workspace.id ?? null;
      // A visitor must stay in the workspace it was given.
      const isolated = !workspace || !seen || seen === workspace;
      workspace ??= seen;
      samples.push({ step: step.name, ms: performance.now() - started, ok: response.ok && isolated, detail: response.ok ? (isolated ? undefined : "saw another workspace") : `${response.status} ${json.error ?? ""}` });
    } catch (error) {
      samples.push({ step: step.name, ms: performance.now() - started, ok: false, detail: `visitor ${index}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { samples, workspace };
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

async function main() {
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: VISITORS }, (_, i) => visitor(i)));
  const wall = (performance.now() - started) / 1000;
  const samples = results.flatMap((r) => r.samples);
  const workspaces = new Set(results.map((r) => r.workspace).filter(Boolean));
  const rows = STEPS.map((step) => {
    const ms = samples.filter((s) => s.step === step.name).map((s) => s.ms).sort((a, b) => a - b);
    const errors = samples.filter((s) => s.step === step.name && !s.ok).length;
    return `| ${step.name} | ${ms.length} | ${errors} | ${Math.round(percentile(ms, 50))} | ${Math.round(percentile(ms, 95))} | ${Math.round(ms.at(-1) ?? 0)} |`;
  });
  const failures = samples.filter((s) => !s.ok);
  process.stdout.write(
    [
      `### Load test: ${VISITORS} concurrent visitors against ${BASE}`,
      "",
      `${samples.length} requests in ${wall.toFixed(1)} s, ${failures.length} errors, ${workspaces.size} separate workspaces.`,
      "",
      "| Step | Requests | Errors | p50 ms | p95 ms | max ms |",
      "|---|---|---|---|---|---|",
      ...rows,
      "",
    ].join("\n"),
  );
  if (failures.length || workspaces.size !== VISITORS) {
    console.error(failures.slice(0, 5).map((f) => `${f.step}: ${f.detail}`).join("\n") || `expected ${VISITORS} workspaces, got ${workspaces.size}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
