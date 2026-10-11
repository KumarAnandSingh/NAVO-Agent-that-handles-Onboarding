/**
 * Personal-data guard for chat and narration. Before text goes to Claude, personal numbers
 * (Aadhaar, PAN, phone, bank account, IFSC, email) are swapped for placeholders such as
 * [PHONE_1]; Claude's reply has them swapped back, so the joiner still sees their own
 * details and Claude never does. Only counts by kind are logged, never the values.
 *
 * Document reading does not use this guard: reading an ID needs the image. It relies on
 * consent, asking only for the fields it needs, and masked storage instead.
 *
 * Masking is deterministic (placeholders are numbered in order of first appearance), so a
 * multi-round conversation sends the same history every round.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type MaskKind = "EMAIL" | "PAN" | "IFSC" | "AADHAAR" | "PHONE" | "BANK_ACCOUNT";

/** Applied in this order, so a longer or more specific pattern wins over a looser one. */
const RULES: { kind: MaskKind; pattern: RegExp }[] = [
  { kind: "EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "PAN", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: "IFSC", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: "AADHAAR", pattern: /(?<!\d)[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?!\d)/g },
  { kind: "PHONE", pattern: /(?<![\d+])(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g },
  { kind: "BANK_ACCOUNT", pattern: /(?<!\d)\d{9,18}(?!\d)/g },
];

const PLACEHOLDER = /\[(?:EMAIL|PAN|IFSC|AADHAAR|PHONE|BANK_ACCOUNT)_\d+\]/g;

/** Told to Claude on every guarded call, so the system prompt is the same whether or not anything was masked. */
export const GUARD_NOTE =
  "Personal numbers may appear as placeholders such as [PHONE_1]. Keep each placeholder exactly as written and never guess what it stands for.";

/** Holds the placeholder ↔ value pairs for one call. Never logged or stored. */
export class Vault {
  private readonly tokens = new Map<string, string>();
  private readonly values = new Map<string, string>();
  private readonly next = new Map<MaskKind, number>();

  mask(text: string): string {
    let out = text;
    for (const { kind, pattern } of RULES) out = out.replace(pattern, (match) => this.tokenFor(kind, match));
    return out;
  }

  unmask(text: string): string {
    return text.replace(PLACEHOLDER, (token) => this.values.get(token) ?? token);
  }

  /** Masks every string inside a JSON value (tool inputs). */
  maskJson(value: unknown): unknown {
    return mapStrings(value, (s) => this.mask(s));
  }

  unmaskJson(value: unknown): unknown {
    return mapStrings(value, (s) => this.unmask(s));
  }

  /** Distinct values masked, by kind. */
  counts(): Partial<Record<MaskKind, number>> {
    return Object.fromEntries(this.next);
  }

  private tokenFor(kind: MaskKind, value: string): string {
    const known = this.tokens.get(value);
    if (known) return known;
    const n = (this.next.get(kind) ?? 0) + 1;
    this.next.set(kind, n);
    const token = `[${kind}_${n}]`;
    this.tokens.set(value, token);
    this.values.set(token, value);
    return token;
  }
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

function maskBlock(block: Anthropic.ContentBlockParam, vault: Vault): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { ...block, text: vault.mask(block.text) };
    case "tool_use":
      return { ...block, input: vault.maskJson(block.input) };
    case "tool_result":
      if (typeof block.content === "string") return { ...block, content: vault.mask(block.content) };
      if (Array.isArray(block.content)) return { ...block, content: block.content.map((c) => (c.type === "text" ? { ...c, text: vault.mask(c.text) } : c)) };
      return block;
    default:
      // Thinking blocks are signed and must go back unchanged; images are not text.
      return block;
  }
}

type Guardable = Pick<Anthropic.MessageCreateParamsNonStreaming, "messages" | "system">;

/** The request with personal numbers masked and the guard note added to the system prompt. */
export function maskRequest<P extends Guardable>(params: P): { params: P; vault: Vault } {
  const vault = new Vault();
  const messages = params.messages.map((m) => ({
    ...m,
    content: typeof m.content === "string" ? vault.mask(m.content) : m.content.map((b) => maskBlock(b, vault)),
  }));
  const system =
    typeof params.system === "string" || params.system === undefined
      ? [params.system, GUARD_NOTE].filter(Boolean).join("\n\n")
      : [...params.system, { type: "text" as const, text: GUARD_NOTE }];
  return { params: { ...params, messages, system }, vault };
}

/** Claude's reply with placeholders swapped back for the joiner's own values. */
export function unmaskResponse(message: Anthropic.Message, vault: Vault): Anthropic.Message {
  const content = message.content.map((block) => {
    if (block.type === "text") return { ...block, text: vault.unmask(block.text) };
    if (block.type === "tool_use") return { ...block, input: vault.unmaskJson(block.input) };
    return block;
  });
  return { ...message, content };
}
