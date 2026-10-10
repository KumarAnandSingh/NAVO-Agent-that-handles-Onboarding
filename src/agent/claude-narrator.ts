/**
 * Claude rewrites Navo's template updates so they read naturally, without changing what
 * they say. The template stays the source of truth: a rewrite is used only if it keeps
 * every name, number, date and ticket from the facts and adds no number of its own.
 * Anything else (offline, over budget, slow, a dropped fact) sends the template. The
 * gateway picks the model (a small, fast one) and masks personal numbers first.
 */
import { textOf } from "@/services/llm/claude";
import type { Llm } from "@/services/llm/gateway";
import { templateUpdate, type Narrator, type UpdateFacts } from "./narration";

export const NARRATION_TIMEOUT_MS = 8_000;
const MAX_CHARS = 320;

const SYSTEM = [
  "You write short in-app updates from Navo, an AI onboarding agent, to a new joiner.",
  "Rewrite the draft so it reads naturally. Keep every fact exactly: names, dates, times, ticket numbers, counts and places.",
  "Add no new facts and no new numbers. Write as Navo (\"I\") to the joiner (\"you\").",
  "Plain, calm sentences. No exclamation marks, no emoji, no markdown. At most 45 words.",
  "Reply with the message only.",
].join("\n");

/** Tokens a rewrite must keep: ticket ids, times, numbers and multi-word names. */
export function salientTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/\b[A-Z]{2,}-\d+\b|\b\d{1,2}:\d{2}\b|\b\d+\b/g)) tokens.add(m[0]);
  for (const m of text.matchAll(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g)) tokens.add(m[0]);
  return [...tokens];
}

/** True when `rewrite` keeps every salient fact and invents no number the draft lacks. */
export function keepsFacts(update: UpdateFacts, rewrite: string): boolean {
  if (!rewrite || rewrite.length > MAX_CHARS || rewrite.includes("!")) return false;
  const draft = templateUpdate(update);
  const kept = Object.values(update.facts).every((fact) => salientTokens(fact).every((token) => rewrite.includes(token)));
  const draftNumbers = new Set(draft.match(/\d+/g) ?? []);
  const invented = (rewrite.match(/\d+/g) ?? []).some((n) => !draftNumbers.has(n));
  return kept && !invented;
}

export function claudeNarrator(llm: Llm): Narrator {
  return {
    async employeeUpdate(update: UpdateFacts, scope) {
      const draft = templateUpdate(update);
      const fallback = { text: draft, composedBy: "template" as const };
      if (!scope) return fallback;
      try {
        const response = await llm.call(
          "narrate",
          scope,
          {
            max_tokens: 1500,
            system: SYSTEM,
            messages: [{ role: "user", content: `Facts: ${JSON.stringify(update.facts)}\n\nDraft: ${draft}` }],
          },
          { timeoutMs: NARRATION_TIMEOUT_MS },
        );
        const text = textOf(response);
        return keepsFacts(update, text) ? { text, composedBy: "claude" } : fallback;
      } catch {
        return fallback;
      }
    },
  };
}
