/**
 * The one place Navo calls Claude. A feature asks for a call and the gateway:
 *   1. picks the models for that feature (models.ts) and sets its effort and caching,
 *   2. masks personal numbers for chat and narration (guard.ts),
 *   3. reserves the call against the daily budget,
 *   4. falls back down the chain when a model is overloaded, rate-limited, unavailable or declines,
 *   5. records every attempt with its model, latency, tokens and what was masked.
 * Callers keep their own deterministic fallback for when the whole chain fails.
 *
 * Access is per request: a visitor's own key (never stored or logged), else the
 * deployment's key, else offline.
 */
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import type { Queryable } from "@/lib/db/client";
import { recordLlmResult, reserveLlmCall, type KeySource } from "./budget";
import { maskRequest, unmaskResponse } from "./guard";
import { routeFor, type LlmFeature } from "./models";

export type { KeySource, LlmFeature };

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { timeout?: number; maxRetries?: number; signal?: AbortSignal },
) => Promise<Anthropic.Message>;

/** How one request reaches Claude. */
export type AiAccess = { mode: "offline" } | { mode: KeySource; create: CreateMessage };

export const OFFLINE: AiAccess = { mode: "offline" };

export interface LlmScope {
  db: Queryable;
  workspaceId: string;
}

export type LlmParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model">;

export interface CallOptions {
  /** Deadline for the whole call, fallbacks included. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface Llm {
  keySource: KeySource;
  call(feature: LlmFeature, scope: LlmScope, params: LlmParams, options: CallOptions): Promise<Anthropic.Message>;
}

/** The daily budget is spent: answer from Navo's rules instead. */
export class LlmUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailable";
  }
}

/** A fallback model gets an attempt only if at least this much of the deadline is left. */
const MIN_ATTEMPT_MS = 1_000;

/**
 * Worth trying the next model: overloaded or server errors, rate limits, a model this key
 * can't use, or a dropped connection. Not a timeout or abort (the deadline is spent), a
 * rejected key or a bad request (the next model would fail the same way).
 */
export function shouldFallBack(error: unknown): boolean {
  if (error instanceof APIUserAbortError || error instanceof APIConnectionTimeoutError) return false;
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    return status === 404 || status === 429 || status >= 500;
  }
  return false;
}

/** The gateway for this request's access, or null when offline. */
export function gateway(access: AiAccess): Llm | null {
  if (access.mode === "offline") return null;
  const { create, mode: keySource } = access;
  return {
    keySource,
    async call(feature, scope, params, { timeoutMs, signal }) {
      const route = routeFor(feature);
      const guarded = route.guard ? maskRequest(params) : null;
      const request = guarded?.params ?? params;
      const masked = guarded?.vault.counts();
      const deadline = performance.now() + timeoutMs;

      for (let i = 0; ; i++) {
        const model = route.models[i]!;
        const last = i === route.models.length - 1;
        const reservation = await reserveLlmCall(scope.db, scope.workspaceId, feature, { keySource, model });
        if (reservation === null) throw new LlmUnavailable("daily Claude budget reached");
        const started = performance.now();
        const timeLeft = () => deadline - performance.now();
        try {
          const response = await create(
            {
              ...request,
              model,
              output_config: { ...request.output_config, effort: route.effort },
              ...(route.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
            },
            { timeout: Math.max(MIN_ATTEMPT_MS, Math.round(timeLeft())), maxRetries: 0, signal },
          );
          const refused = response.stop_reason === "refusal";
          await recordLlmResult(scope.db, reservation, { status: refused ? "refused" : "ok", usage: response.usage, latencyMs: performance.now() - started, masked });
          if (refused && !last && timeLeft() >= MIN_ATTEMPT_MS) continue;
          return guarded ? unmaskResponse(response, guarded.vault) : response;
        } catch (error) {
          await recordLlmResult(scope.db, reservation, { status: "failed", usage: null, latencyMs: performance.now() - started, masked });
          if (last || signal?.aborted || !shouldFallBack(error) || timeLeft() < MIN_ATTEMPT_MS) throw error;
        }
      }
    },
  };
}

let serverClient: Anthropic | null = null;

/** The deployment's own key, when one is configured and live AI isn't switched off. */
export function serverAccess(env: Record<string, string | undefined> = process.env): AiAccess {
  if (!env.ANTHROPIC_API_KEY || env.NAVO_LIVE_AI === "off") return OFFLINE;
  serverClient ??= new Anthropic();
  const client = serverClient;
  return { mode: "server", create: (params, options) => client.messages.create(params, options) };
}

/** A visitor's own key, for this request only. The client lives as long as the request. */
export function visitorAccess(apiKey: string): AiAccess {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return { mode: "visitor", create: (params, options) => client.messages.create(params, options) };
}
