import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "@/services/llm/claude";

/** A scripted stand-in for Claude: each call returns the next scripted turn. */
export interface FakeClaude {
  create: CreateMessage;
  calls: Anthropic.MessageCreateParamsNonStreaming[];
}

type Turn = Anthropic.ContentBlock[] | ((params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.ContentBlock[]) | "hang" | Error;

export function message(content: Anthropic.ContentBlock[], stop?: Anthropic.StopReason): Anthropic.Message {
  const stop_reason = stop ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 40 },
  } as unknown as Anthropic.Message;
}

export const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Anthropic.ContentBlock;
export const toolUse = (name: string, input: Record<string, unknown>, id = `toolu_${name}`) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;

export function fakeClaude(turns: Turn[]): FakeClaude {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const create: CreateMessage = async (params, options) => {
    calls.push(params);
    const turn = turns[Math.min(i++, turns.length - 1)]!;
    if (turn === "hang") {
      return new Promise<Anthropic.Message>((_, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    if (turn instanceof Error) throw turn;
    return message(typeof turn === "function" ? turn(params) : turn);
  };
  return { create, calls };
}
