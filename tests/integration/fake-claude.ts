import type Anthropic from "@anthropic-ai/sdk";
import { gateway, type CreateMessage, type KeySource, type Llm } from "@/services/llm/gateway";

/** A scripted stand-in for Claude: each call returns the next scripted turn. */
export interface FakeClaude {
  create: CreateMessage;
  /** The real gateway (routing, fallbacks, guard, budget) over the scripted Claude. */
  llm: Llm;
  calls: Anthropic.MessageCreateParamsNonStreaming[];
}

type Turn =
  | Anthropic.ContentBlock[]
  | ((params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.ContentBlock[])
  | { content: Anthropic.ContentBlock[]; stop: Anthropic.StopReason }
  | "hang"
  | Error;

export function message(content: Anthropic.ContentBlock[], stop?: Anthropic.StopReason, model = "claude-opus-5-5"): Anthropic.Message {
  const stop_reason = stop ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 40 },
  } as unknown as Anthropic.Message;
}

export const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Anthropic.ContentBlock;
export const toolUse = (name: string, input: Record<string, unknown>, id = `toolu_${name}`) =>
  ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;

export function fakeClaude(turns: Turn[], keySource: KeySource = "server"): FakeClaude {
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
    if (typeof turn === "function") return message(turn(params), undefined, params.model);
    if (Array.isArray(turn)) return message(turn, undefined, params.model);
    return message(turn.content, turn.stop, params.model);
  };
  return { create, llm: gateway({ mode: keySource, create })!, calls };
}
