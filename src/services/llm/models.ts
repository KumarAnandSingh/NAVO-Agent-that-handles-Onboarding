/**
 * Which Claude model handles which task, and what it costs. Each feature gets the smallest
 * model that does the job well, with a fallback chain for when that model is overloaded,
 * unavailable or declines. Prices are list prices in USD per million tokens, used only for
 * the estimate in the runtime panel; check current pricing before budgeting on them.
 */
export type LlmFeature = "ask" | "read_document" | "narrate";
export type Effort = "low" | "medium" | "high";

export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;

export interface Route {
  feature: LlmFeature;
  label: string;
  /** Tried in order: the first is the primary, the rest are fallbacks. */
  models: string[];
  effort: Effort;
  /** Cache the prompt prefix: worth it when the same prefix is sent again, as in a tool loop. */
  cache: boolean;
  /** Mask personal numbers before the text leaves Navo (chat and narration, not document reading). */
  guard: boolean;
  /** Why this model, for the docs and the runtime panel. */
  why: string;
}

const DEFAULTS: Record<LlmFeature, Omit<Route, "feature">> = {
  narrate: {
    label: "Status updates",
    models: [MODELS.haiku, MODELS.sonnet],
    effort: "low",
    cache: false,
    guard: true,
    why: "A short rewrite of a template that code then fact-checks: the fastest, cheapest model is enough.",
  },
  ask: {
    label: "Ask Navo",
    models: [MODELS.sonnet, MODELS.opus],
    effort: "low",
    cache: true,
    guard: true,
    why: "A few rounds of tool use over live state and policy: Sonnet balances quality and speed.",
  },
  read_document: {
    label: "Document reading",
    models: [MODELS.opus, MODELS.sonnet],
    effort: "low",
    cache: false,
    guard: false,
    why: "Reading identity documents from images, where a wrong digit is costly: the most accurate model.",
  },
};

const ENV_OVERRIDE: Record<LlmFeature, string> = {
  narrate: "NAVO_MODEL_NARRATE",
  ask: "NAVO_MODEL_ASK",
  read_document: "NAVO_MODEL_DOCUMENTS",
};

export const FEATURES = Object.keys(DEFAULTS) as LlmFeature[];

/**
 * The route for a feature. A per-feature override (NAVO_MODEL_ASK and so on) wins, then
 * NAVO_MODEL for every feature, then the default. The default chain still backs up an override.
 */
export function routeFor(feature: LlmFeature, env: Record<string, string | undefined> = process.env): Route {
  const base = DEFAULTS[feature];
  const pinned = env[ENV_OVERRIDE[feature]]?.trim() || env.NAVO_MODEL?.trim();
  const models = pinned ? [pinned, ...base.models.filter((m) => m !== pinned)] : base.models;
  return { feature, ...base, models };
}

/** Every model any route can use, primaries first. */
export function routedModels(env: Record<string, string | undefined> = process.env): string[] {
  return [...new Set(FEATURES.flatMap((f) => routeFor(f, env).models))];
}

interface Price {
  input: number;
  output: number;
  /** Writing a 5-minute cache entry. */
  cacheWrite: number;
  cacheRead: number;
}

/** List prices, USD per million tokens (Haiku at its rate for prompts up to 100K tokens). */
export const PRICES: Record<string, Price> = {
  [MODELS.opus]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  [MODELS.sonnet]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.haiku]: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Estimated cost at list price in USD, or null for a model with no known price. */
export function estimateCostUsd(model: string, tokens: TokenCounts): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const micro = tokens.input * price.input + tokens.output * price.output + tokens.cacheRead * price.cacheRead + tokens.cacheWrite * price.cacheWrite;
  return micro / 1_000_000;
}

const NAMES: Record<string, string> = {
  [MODELS.opus]: "Opus 5.5",
  [MODELS.sonnet]: "Sonnet 5.5",
  [MODELS.haiku]: "Haiku 5.5",
};

/** "Sonnet 5.5" for a known model, the id otherwise. */
export function modelName(model: string): string {
  return NAMES[model] ?? model;
}
