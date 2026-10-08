/**
 * Daily Claude call budget, so a public demo can't run up an unbounded bill. A call is
 * reserved before it is made (failures count too), then its token usage is recorded.
 * The day is real UTC time on purpose: this is an operational limit, not business logic.
 */
import { and, count, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import type { Queryable } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";

export type LlmFeature = "ask" | "read_document" | "narrate";

export const GLOBAL_DAILY_LIMIT = Number(process.env.NAVO_DAILY_LLM_CALL_LIMIT) || 400;
export const WORKSPACE_DAILY_LIMIT = Number(process.env.NAVO_WORKSPACE_DAILY_LLM_CALL_LIMIT) || 80;

const today = () => new Date().toISOString().slice(0, 10);

/** Reserve one call. Returns the reservation id, or null when a daily limit is reached. */
export async function reserveLlmCall(db: Queryable, workspaceId: string, feature: LlmFeature): Promise<number | null> {
  const day = today();
  const [all] = await db.select({ n: count() }).from(llmUsage).where(eq(llmUsage.day, day));
  if ((all?.n ?? 0) >= GLOBAL_DAILY_LIMIT) return null;
  const [mine] = await db
    .select({ n: count() })
    .from(llmUsage)
    .where(and(eq(llmUsage.day, day), eq(llmUsage.workspaceId, workspaceId)));
  if ((mine?.n ?? 0) >= WORKSPACE_DAILY_LIMIT) return null;
  const [row] = await db.insert(llmUsage).values({ day, workspaceId, feature }).returning({ id: llmUsage.id });
  return row?.id ?? null;
}

export async function recordLlmResult(db: Queryable, reservationId: number, usage: Anthropic.Usage | null): Promise<void> {
  await db
    .update(llmUsage)
    .set({ status: usage ? "ok" : "failed", inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0 })
    .where(eq(llmUsage.id, reservationId));
}
