/**
 * The one place Navo talks to Claude. Callers get a `CreateMessage` function, or null in
 * offline mode, and must always have a deterministic fallback ready.
 */
import Anthropic from "@anthropic-ai/sdk";

export const NAVO_MODEL = process.env.NAVO_MODEL || "claude-opus-5-5";

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { timeout?: number; maxRetries?: number; signal?: AbortSignal },
) => Promise<Anthropic.Message>;

/** Live Claude features are on when a key is configured, unless explicitly switched off. */
export function liveAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.NAVO_LIVE_AI !== "off";
}

let client: Anthropic | null = null;

/** A Claude `messages.create`, or null when running offline. */
export function claudeCreate(): CreateMessage | null {
  if (!liveAiEnabled()) return null;
  client ??= new Anthropic();
  const live = client;
  return (params, options) => live.messages.create(params, options);
}

/** Concatenated text blocks of a response (thinking and tool blocks are skipped). */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
