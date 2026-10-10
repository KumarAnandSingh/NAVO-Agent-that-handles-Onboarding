import type Anthropic from "@anthropic-ai/sdk";

/** Concatenated text blocks of a response (thinking and tool blocks are skipped). */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
