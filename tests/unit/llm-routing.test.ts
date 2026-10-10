import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { GUARD_NOTE, Vault, maskRequest, unmaskResponse } from "@/services/llm/guard";
import { MODELS, estimateCostUsd, modelName, routeFor, routedModels } from "@/services/llm/models";

describe("model routing", () => {
  it("sends each task to a right-sized model with a fallback", () => {
    expect(routeFor("narrate", {}).models).toEqual([MODELS.haiku, MODELS.sonnet]);
    expect(routeFor("ask", {}).models).toEqual([MODELS.sonnet, MODELS.opus]);
    expect(routeFor("read_document", {}).models).toEqual([MODELS.opus, MODELS.sonnet]);
    expect(routeFor("ask", {})).toMatchObject({ effort: "low", cache: true, guard: true });
    expect(routeFor("read_document", {})).toMatchObject({ cache: false, guard: false });
  });

  it("lets a deployer pin one task or every task, keeping the default chain behind the override", () => {
    expect(routeFor("ask", { NAVO_MODEL_ASK: MODELS.opus }).models).toEqual([MODELS.opus, MODELS.sonnet]);
    expect(routeFor("narrate", { NAVO_MODEL: MODELS.opus }).models).toEqual([MODELS.opus, MODELS.haiku, MODELS.sonnet]);
    expect(routeFor("narrate", { NAVO_MODEL: MODELS.opus, NAVO_MODEL_NARRATE: MODELS.sonnet }).models).toEqual([MODELS.sonnet, MODELS.haiku]);
    expect(routeFor("ask", { NAVO_MODEL_ASK: "  " }).models).toEqual([MODELS.sonnet, MODELS.opus]);
    expect(routedModels({})).toEqual([MODELS.haiku, MODELS.sonnet, MODELS.opus]);
  });

  it("estimates cost at list price, cache reads included", () => {
    // 1M input + 1M output on Sonnet: $2 + $10.
    expect(estimateCostUsd(MODELS.sonnet, { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(12);
    // Cache reads cost a tenth of input on Haiku; writes 1.25x.
    expect(estimateCostUsd(MODELS.haiku, { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 })).toBeCloseTo(0.135);
    expect(estimateCostUsd("some-other-model", { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeNull();
    expect(modelName(MODELS.opus)).toBe("Opus 5.5");
    expect(modelName("custom")).toBe("custom");
  });
});

describe("personal-data guard", () => {
  it("masks Indian personal numbers and emails, and nothing else Navo writes", () => {
    const vault = new Vault();
    const text =
      "Aadhaar 2345 6789 0123, PAN ABCDE1234F, phone +91 98765 43210, account 001234567890, IFSC MRDN0001234, mail kavya.m@example.com. Ticket IT-55231 at 10:30 on 2026-10-19, ID card ••••4821.";
    const masked = vault.mask(text);
    expect(masked).toBe(
      "Aadhaar [AADHAAR_1], PAN [PAN_1], phone [PHONE_1], account [BANK_ACCOUNT_1], IFSC [IFSC_1], mail [EMAIL_1]. Ticket IT-55231 at 10:30 on 2026-10-19, ID card ••••4821.",
    );
    expect(vault.counts()).toEqual({ AADHAAR: 1, PAN: 1, PHONE: 1, BANK_ACCOUNT: 1, IFSC: 1, EMAIL: 1 });
    expect(vault.unmask(masked)).toBe(text);
  });

  it("numbers placeholders by first appearance, so a repeated value keeps its placeholder", () => {
    const vault = new Vault();
    expect(vault.mask("Call 9876543210 or 9123456780, then 9876543210 again")).toBe("Call [PHONE_1] or [PHONE_2], then [PHONE_1] again");
    expect(vault.unmask("[PHONE_2] and [PHONE_9]")).toBe("9123456780 and [PHONE_9]");
  });

  it("masks a request deterministically and always adds the same note to the system prompt", () => {
    const thinking = { type: "thinking", thinking: "My PAN is ABCDE1234F", signature: "sig" } as Anthropic.ContentBlockParam;
    const request = {
      model: MODELS.sonnet,
      max_tokens: 100,
      system: "You are Navo.",
      messages: [
        { role: "user", content: "My phone is 98765 43210" },
        {
          role: "assistant",
          content: [thinking, { type: "text", text: "Noted 98765 43210." }, { type: "tool_use", id: "t1", name: "lookup", input: { phone: "98765 43210", n: 2 } }],
        },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "PAN ABCDE1234F on file" }] }] },
      ],
    } satisfies Anthropic.MessageCreateParamsNonStreaming;
    const first = maskRequest(request);
    const second = maskRequest(request);
    expect(JSON.stringify(first.params)).toBe(JSON.stringify(second.params));
    expect(first.params.system).toBe(`You are Navo.\n\n${GUARD_NOTE}`);
    expect(maskRequest({ ...request, messages: [{ role: "user", content: "Hello" }] }).params.system).toBe(first.params.system);
    const [user, assistant, result] = first.params.messages;
    expect(user!.content).toBe("My phone is [PHONE_1]");
    const blocks = assistant!.content as Anthropic.ContentBlockParam[];
    expect(blocks[0]).toBe(thinking); // signed: sent back untouched
    expect(blocks[1]).toMatchObject({ text: "Noted [PHONE_1]." });
    expect(blocks[2]).toMatchObject({ input: { phone: "[PHONE_1]", n: 2 } });
    expect(JSON.stringify(result!.content)).toContain("PAN [PAN_1] on file");
    expect(maskRequest({ ...request, system: [{ type: "text", text: "Blocks" }] }).params.system).toEqual([
      { type: "text", text: "Blocks" },
      { type: "text", text: GUARD_NOTE },
    ]);
  });

  it("puts the joiner's own values back into Claude's reply", () => {
    const { vault } = maskRequest({ messages: [{ role: "user", content: "Text me on 9876543210" }] });
    const reply = {
      content: [
        { type: "text", text: "I'll text [PHONE_1].", citations: null },
        { type: "tool_use", id: "t", name: "notify", input: { to: "[PHONE_1]" } },
      ],
    } as Anthropic.Message;
    const restored = unmaskResponse(reply, vault);
    expect(restored.content[0]).toMatchObject({ text: "I'll text 9876543210." });
    expect(restored.content[1]).toMatchObject({ input: { to: "9876543210" } });
  });
});
