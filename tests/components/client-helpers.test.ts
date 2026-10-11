// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetClaudeKey, keyHeaders, readClaudeKey, saveClaudeKey } from "@/ui/state/claude-key";
import { answeredBy, faceForTool, screenForChapter } from "@/ui/state/NavoStore";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("client helpers", () => {
  it("keeps the visitor key in session storage and sends it only as a header", () => {
    expect(keyHeaders()).toEqual({});
    expect(saveClaudeKey("sk-ant-x")).toBe(true);
    expect(readClaudeKey()).toBe("sk-ant-x");
    expect(keyHeaders()).toEqual({ "x-navo-claude-key": "sk-ant-x" });
    forgetClaudeKey();
    expect(readClaudeKey()).toBeNull();
  });

  it("degrades quietly when the browser blocks storage", () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const)
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readClaudeKey()).toBeNull();
    expect(saveClaudeKey("sk-ant-x")).toBe(false);
    expect(() => forgetClaudeKey()).not.toThrow();
  });

  it("labels who answered", () => {
    expect(answeredBy({ composedBy: "claude", model: "claude-sonnet-5-5" })).toBe("Answered by Claude Sonnet 5.5 with Navo's tools");
    expect(answeredBy({ composedBy: "claude" })).toBe("Answered by Claude with Navo's tools");
    expect(answeredBy({ composedBy: "fallback", fallbackReason: "offline" })).toBe("Answered from Navo's rules (no AI key connected)");
    expect(answeredBy({ composedBy: "fallback", fallbackReason: "timed out after 25000ms" })).toBe("Answered from Navo's rules (Claude was unavailable)");
  });

  it("maps chapters to screens and tools to faces", () => {
    expect(screenForChapter("documents")).toBeTruthy();
    expect(screenForChapter("day1")).not.toBe(screenForChapter("documents"));
    expect(faceForTool("send_reminder")).toBeTruthy();
    expect(faceForTool("unknown_tool")).toBeTruthy();
  });
});
