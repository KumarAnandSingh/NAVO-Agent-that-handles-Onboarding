/**
 * Cost model: what live Claude would cost per onboarding, measured rather than guessed.
 *
 *   npx tsx scripts/cost-model.ts
 *
 * Runs one full onboarding per scenario (documents to Day 30) plus six Ask Navo questions
 * through the real gateway, with a recording stand-in for Claude that answers the way the
 * real model would (rewrites, readings, a tool round then an answer). It counts every call
 * and measures every prompt, then prices them at list price for the routed models and, for
 * comparison, with every task on the largest model. No API calls, no cost.
 *
 * Token estimates: text at about 3.6 characters per token; a 900 x 1100 document image at
 * about 1,320 tokens (width x height / 750). Output tokens are assumptions per task,
 * stated in the table, since a stand-in can't measure them.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { claudeNarrator } from "../src/agent/claude-narrator";
import { SAMPLE_DOCUMENTS } from "../src/content/seed/documents";
import { createMemoryDb, type Db } from "../src/lib/db/client";
import { approvals } from "../src/lib/db/schema";
import { askNavo } from "../src/services/ask";
import { advanceStory } from "../src/services/demo-director";
import { claudeReader } from "../src/services/documents/claude-reader";
import {
  completeTraining,
  confirmDocumentField,
  confirmPickup,
  decideApproval,
  enrolBenefits,
  setEmergencyContact,
  submitForms,
  uploadSampleDocument,
} from "../src/services/employee-actions";
import { gateway, type CreateMessage } from "../src/services/llm/gateway";
import { MODELS, PRICES, estimateCostUsd, modelName, routeFor, type LlmFeature } from "../src/services/llm/models";
import { createWorkspace } from "../src/services/workspace";

const ANAND = "anand.mehta";
const CHARS_PER_TOKEN = 3.6;
const IMAGE_TOKENS = Math.round((900 * 1100) / 750);
/** Assumed output per call, including low-effort thinking. */
const OUTPUT_TOKENS = { narrate: 150, read_document: 350, ask: 170 } as const;
const QUESTIONS = [
  "What if HR doesn't respond?",
  "What should I bring Monday?",
  "Can I add my parents to insurance?",
  "When will my laptop be ready?",
  "How much annual leave do I get?",
  "Who can see the documents I uploaded?",
];

interface Call {
  feature: LlmFeature;
  inputTokens: number;
  /** Input tokens a cache could serve: the prefix the previous round already sent. */
  cacheableTokens: number;
}

const calls: Call[] = [];

function text(t: string): Anthropic.ContentBlock {
  return { type: "text", text: t, citations: null } as Anthropic.TextBlock;
}

function featureOf(params: Anthropic.MessageCreateParamsNonStreaming): LlmFeature {
  if (params.tools) return "ask";
  if (params.output_config?.format) return "read_document";
  return "narrate";
}

/** Characters of text in the request, images counted separately. */
function measure(params: Anthropic.MessageCreateParamsNonStreaming): { chars: number; images: number } {
  let images = 0;
  const json = JSON.stringify({ system: params.system, tools: params.tools, messages: params.messages }, (key, value: unknown) => {
    if (key === "data" && typeof value === "string" && value.length > 1000) {
      images++;
      return "";
    }
    return value;
  });
  return { chars: json.length, images };
}

const previousAskInput = new Map<string, number>();

const recording: CreateMessage = async (params) => {
  const feature = featureOf(params);
  const { chars, images } = measure(params);
  const inputTokens = Math.round(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
  const first = params.messages[0];
  const conversation = typeof first?.content === "string" ? first.content : "";
  const cacheableTokens = feature === "ask" ? (previousAskInput.get(conversation) ?? 0) : 0;
  if (feature === "ask") previousAskInput.set(conversation, inputTokens);
  calls.push({ feature, inputTokens, cacheableTokens });

  let content: Anthropic.ContentBlock[];
  let stop: Anthropic.StopReason = "end_turn";
  if (feature === "ask") {
    const last = params.messages.at(-1)!;
    if (typeof last.content === "string") {
      content = [{ type: "tool_use", id: "toolu_1", name: "search_policies", input: { query: last.content } } as Anthropic.ToolUseBlock];
      stop = "tool_use";
    } else content = [text("I checked your onboarding and Halden's policies. Your HR owner can help with anything else.")];
  } else if (feature === "read_document") {
    // Read the document the way the real model does: the sample's printed values.
    const prompt = JSON.stringify(params.messages);
    const sample = SAMPLE_DOCUMENTS.find((d) => prompt.includes(`Document: ${d.label}.`));
    const fields = (sample?.expected ?? []).map((f) => ({ name: f.name, value: f.value, raw: f.raw ?? f.value, confidence: f.confidence }));
    content = [text(JSON.stringify({ fields }))];
  } else {
    const prompt = JSON.stringify(params.messages);
    content = [text(/Draft: (.*?)"/.exec(prompt)?.[1] ?? "OK")];
  }
  return {
    id: "msg_model",
    type: "message",
    role: "assistant",
    model: params.model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: OUTPUT_TOKENS[feature] },
  } as Anthropic.Message;
};

async function onboarding(db: Db, scenario: "hr_responds" | "hr_silent") {
  const llm = gateway({ mode: "visitor", create: recording })!;
  const deps = { narrator: claudeNarrator(llm), reader: claudeReader(llm) };
  const ws = (await createWorkspace(db, scenario)).id;
  await uploadSampleDocument(db, ws, ANAND, "relieving-letter", deps);
  await uploadSampleDocument(db, ws, ANAND, "electricity-bill", deps);
  await confirmDocumentField(db, ws, ANAND, "relieving_letter", "2026-10-16", deps);
  await setEmergencyContact(db, ws, ANAND, "Kavya Mehta · +91 00000 11223");
  await submitForms(db, ws, ANAND, deps);
  const attempt = (work: Promise<unknown>) => work.catch(() => undefined);
  for (let step = 0; step < 80; step++) {
    const processed = await advanceStory(db, ws, deps);
    const pending = await db.select().from(approvals).where(and(eq(approvals.workspaceId, ws), eq(approvals.status, "pending"), eq(approvals.requestedFrom, ANAND)));
    for (const a of pending) await decideApproval(db, ws, ANAND, a.id, "approved", deps);
    await attempt(completeTraining(db, ws, ANAND, deps));
    await attempt(confirmPickup(db, ws, ANAND, ["id", "laptop", "kit"], deps));
    await attempt(enrolBenefits(db, ws, ANAND, deps));
    if (processed.length === 0 && pending.length === 0) break;
  }
  for (const q of QUESTIONS) await askNavo(db, ws, q, { llm });
}

function price(model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0) {
  return estimateCostUsd(model, { input, output, cacheRead, cacheWrite }) ?? 0;
}

async function main() {
  const db = await createMemoryDb();
  const results: string[] = [];
  for (const scenario of ["hr_responds", "hr_silent"] as const) {
    calls.length = 0;
    previousAskInput.clear();
    await onboarding(db, scenario);
    const rows: string[] = [];
    let routed = 0;
    let cached = 0;
    let opus = 0;
    for (const feature of ["narrate", "read_document", "ask"] as const) {
      const mine = calls.filter((c) => c.feature === feature);
      const input = mine.reduce((n, c) => n + c.inputTokens, 0);
      const cacheable = mine.reduce((n, c) => n + c.cacheableTokens, 0);
      const output = mine.length * OUTPUT_TOKENS[feature];
      const model = routeFor(feature, {}).models[0]!;
      const cost = price(model, input, output);
      // With caching, a prefix the previous round sent is written once at the cache-write rate (in place of that
      // round's normal input price) and read back at the cache-read rate (in place of this round's).
      const withCache = routeFor(feature, {}).cache ? price(model, input - 2 * cacheable, output, cacheable, cacheable) : cost;
      routed += cost;
      cached += withCache;
      opus += price(MODELS.opus, input, output);
      rows.push(`| ${routeFor(feature, {}).label} | ${modelName(model)} | ${mine.length} | ${input.toLocaleString("en")} | ${output.toLocaleString("en")} | $${cost.toFixed(4)} | $${withCache.toFixed(4)} |`);
    }
    results.push(
      `#### ${scenario === "hr_responds" ? "HR responds" : "HR stays silent"}`,
      "",
      "| Task | Model | Calls | Input tokens | Output tokens | Cost | With caching |",
      "|---|---|---|---|---|---|---|",
      ...rows,
      `| **Total per onboarding** | | **${calls.length}** | | | **$${routed.toFixed(3)}** | **$${cached.toFixed(3)}** |`,
      "",
      `Every task on ${modelName(MODELS.opus)} instead: $${opus.toFixed(3)}. Routing alone saves ${Math.round((1 - routed / opus) * 100)}%; with prompt caching, ${Math.round((1 - cached / opus) * 100)}%.`,
      "",
    );
  }
  const prices = Object.entries(PRICES).map(([m, p]) => `${modelName(m)} $${p.input} / $${p.output}`).join(", ");
  process.stdout.write(
    [
      "### Cost per onboarding (estimated, list price)",
      "",
      `One joiner from documents to Day 30, plus ${QUESTIONS.length} Ask Navo questions. Prices per million input / output tokens: ${prices}.`,
      `Output per call assumed: status update ${OUTPUT_TOKENS.narrate}, document ${OUTPUT_TOKENS.read_document}, Ask round ${OUTPUT_TOKENS.ask} tokens.`,
      "",
      ...results,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
