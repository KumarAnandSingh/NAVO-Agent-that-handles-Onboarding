/**
 * What the AI did in this workspace: calls, fallbacks, latency, tokens and estimated cost
 * per task and model, plus the routes in force. Shown in the runtime panel so the routing
 * and its cost are visible, not just claimed.
 */
import { eq } from "drizzle-orm";
import type { Queryable } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";
import type { AiStatusVM } from "@/services/view-model/types";
import type { AiAccess } from "./gateway";
import { FEATURES, estimateCostUsd, modelName, routeFor, type LlmFeature } from "./models";

type UsageRow = Pick<
  typeof llmUsage.$inferSelect,
  "feature" | "model" | "status" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "latencyMs" | "masked"
>;

/** Group usage rows by task and model. Pure, so it is tested directly. */
export function summariseUsage(rows: UsageRow[]): Pick<AiStatusVM, "usage" | "masked" | "totalCostUsd"> {
  const groups = new Map<string, UsageRow[]>();
  for (const row of rows) {
    if (row.status === "reserved") continue;
    const key = `${row.feature}|${row.model ?? "unknown"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const order = (feature: LlmFeature) => FEATURES.indexOf(feature);
  const usage = [...groups.values()]
    .map((group) => {
      const first = group[0]!;
      const model = first.model ?? "unknown";
      const sum = (pick: (r: UsageRow) => number) => group.reduce((n, r) => n + pick(r), 0);
      const timed = group.filter((r) => r.latencyMs !== null);
      const tokens = { input: sum((r) => r.inputTokens), output: sum((r) => r.outputTokens), cacheRead: sum((r) => r.cacheReadTokens), cacheWrite: sum((r) => r.cacheWriteTokens) };
      return {
        feature: first.feature,
        label: routeFor(first.feature).label,
        model: modelName(model),
        calls: group.length,
        failed: group.filter((r) => r.status !== "ok").length,
        avgLatencyMs: timed.length ? Math.round(timed.reduce((n, r) => n + (r.latencyMs ?? 0), 0) / timed.length) : null,
        tokensIn: tokens.input + tokens.cacheRead + tokens.cacheWrite,
        tokensOut: tokens.output,
        cachedTokens: tokens.cacheRead,
        costUsd: estimateCostUsd(model, tokens),
      };
    })
    .sort((a, b) => order(a.feature) - order(b.feature) || b.calls - a.calls);
  const masked = rows.reduce((n, r) => n + Object.values(r.masked ?? {}).reduce((m, c) => m + c, 0), 0);
  const totalCostUsd = usage.reduce((n, u) => n + (u.costUsd ?? 0), 0);
  return { usage, masked, totalCostUsd };
}

export async function aiStatus(db: Queryable, workspaceId: string, access: AiAccess, byok: boolean): Promise<AiStatusVM> {
  const rows = await db
    .select({
      feature: llmUsage.feature,
      model: llmUsage.model,
      status: llmUsage.status,
      inputTokens: llmUsage.inputTokens,
      outputTokens: llmUsage.outputTokens,
      cacheReadTokens: llmUsage.cacheReadTokens,
      cacheWriteTokens: llmUsage.cacheWriteTokens,
      latencyMs: llmUsage.latencyMs,
      masked: llmUsage.masked,
    })
    .from(llmUsage)
    .where(eq(llmUsage.workspaceId, workspaceId));
  const routes = FEATURES.map((feature) => {
    const route = routeFor(feature);
    return { feature, label: route.label, models: route.models.map(modelName), effort: route.effort, why: route.why };
  });
  return { mode: access.mode, byok, routes, ...summariseUsage(rows) };
}
