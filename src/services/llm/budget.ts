/**
 * Daily Claude call budget and usage log. A call is reserved before it is made (failures
 * count too), then its model, latency and token usage are recorded. The global cap protects
 * the deployment's own key; calls on a visitor's own key count only toward the per-workspace
 * cap, which guards against a runaway loop. The day is real UTC time on purpose: this is an
 * operational limit, not business logic.
 */
import { and, count, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import type { Queryable } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";
import type { LlmFeature } from "./models";

export type { LlmFeature };
export type KeySource = "server" | "visitor";

export const GLOBAL_DAILY_LIMIT = Number(process.env.NAVO_DAILY_LLM_CALL_LIMIT) || 400;
export const WORKSPACE_DAILY_LIMIT = Number(process.env.NAVO_WORKSPACE_DAILY_LLM_CALL_LIMIT) || 80;

const today = () => new Date().toISOString().slice(0, 10);

/** Reserve one call. Returns the reservation id, or null when a daily limit is reached. */
export async function reserveLlmCall(
  db: Queryable,
  workspaceId: string,
  feature: LlmFeature,
  call: { keySource?: KeySource; model?: string } = {},
): Promise<number | null> {
  const day = today();
  const keySource = call.keySource ?? "server";
  if (keySource === "server") {
    const [all] = await db
      .select({ n: count() })
      .from(llmUsage)
      .where(and(eq(llmUsage.day, day), eq(llmUsage.keySource, "server")));
    if ((all?.n ?? 0) >= GLOBAL_DAILY_LIMIT) return null;
  }
  const [mine] = await db
    .select({ n: count() })
    .from(llmUsage)
    .where(and(eq(llmUsage.day, day), eq(llmUsage.workspaceId, workspaceId)));
  if ((mine?.n ?? 0) >= WORKSPACE_DAILY_LIMIT) return null;
  const [row] = await db
    .insert(llmUsage)
    .values({ day, workspaceId, feature, keySource, model: call.model ?? null })
    .returning({ id: llmUsage.id });
  return row?.id ?? null;
}

export interface LlmResult {
  status: "ok" | "refused" | "failed";
  usage: Anthropic.Usage | null;
  latencyMs?: number;
  masked?: Record<string, number>;
}

export async function recordLlmResult(db: Queryable, reservationId: number, result: LlmResult): Promise<void> {
  const { usage } = result;
  await db
    .update(llmUsage)
    .set({
      status: result.status,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
      latencyMs: result.latencyMs === undefined ? null : Math.round(result.latencyMs),
      masked: result.masked && Object.keys(result.masked).length ? result.masked : null,
    })
    .where(eq(llmUsage.id, reservationId));
}
