/**
 * "Test connection" for a visitor's own Claude key. Looks up each routed model with the
 * Models API, which costs nothing, so a visitor learns whether the key works and which
 * models it can use before any paid call. The key is never stored or logged.
 */
import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { modelName, routedModels } from "./models";

export type KeyCheck = { ok: true; models: { id: string; name: string; available: boolean }[] } | { ok: false; error: string };

type Retrieve = (model: string) => Promise<unknown>;

function explain(error: unknown): string {
  if (error instanceof APIConnectionError) return "Couldn't reach the Claude API. Check your connection and try again.";
  if (error instanceof APIError) {
    if (error.status === 401) return "Anthropic rejected this key. Check that you copied all of it.";
    if (error.status === 403) return "This key isn't allowed to use the Claude API.";
    return `The Claude API returned an error (${error.status ?? "unknown"}). Try again in a minute.`;
  }
  return "Couldn't check this key. Try again.";
}

export async function checkKey(apiKey: string, retrieve?: Retrieve): Promise<KeyCheck> {
  const lookup: Retrieve = retrieve ?? ((model) => new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 }).models.retrieve(model));
  const models = routedModels();
  const results = await Promise.allSettled(models.map((id) => lookup(id)));
  // A rejected key fails every lookup the same way: report that, not a list of unavailable models.
  const fatal = results.find(
    (r): r is PromiseRejectedResult =>
      r.status === "rejected" && (r.reason instanceof APIConnectionError || (r.reason instanceof APIError && (r.reason.status === 401 || r.reason.status === 403))),
  );
  if (fatal) return { ok: false, error: explain(fatal.reason) };
  const list = models.map((id, i) => ({ id, name: modelName(id), available: results[i]!.status === "fulfilled" }));
  if (!list.some((m) => m.available)) {
    const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    return { ok: false, error: explain(first?.reason) };
  }
  return { ok: true, models: list };
}
