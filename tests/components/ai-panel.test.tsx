// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStatusVM } from "@/services/view-model/types";
import { AiPanel } from "@/ui/ai/AiPanel";

const KEY = `sk-ant-api03-${"k".repeat(40)}`;

const routes: AiStatusVM["routes"] = [
  { feature: "narrate", label: "Status updates", models: ["Haiku 5.5", "Sonnet 5.5"], effort: "low", why: "Short rewrites" },
  { feature: "ask", label: "Ask Navo", models: ["Sonnet 5.5", "Opus 5.5"], effort: "low", why: "Tool use" },
];
const offline: AiStatusVM = { mode: "offline", byok: true, routes, usage: [], masked: 0, totalCostUsd: 0 };

function fetchReturning(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 400, json: async () => body }) as Response);
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI panel", () => {
  it("shows the routing and offers a visitor key when offline", () => {
    render(<AiPanel ai={offline} onChange={() => {}} />);
    const panel = screen.getByRole("region", { name: "AI models and usage" });
    expect(panel.textContent).toContain("Offline · Navo's rules, no AI key");
    expect(panel.textContent).toContain("Ask Navo");
    expect(panel.textContent).toContain("Sonnet 5.5 → Opus 5.5");
    expect(screen.getByRole("button", { name: "Try it with your own Claude key" })).toBeTruthy();
  });

  it("shows calls, fallbacks, latency, cost and masked numbers once Claude has worked", () => {
    const live: AiStatusVM = {
      ...offline,
      mode: "server",
      usage: [
        { feature: "ask", label: "Ask Navo", model: "Sonnet 5.5", calls: 3, failed: 1, avgLatencyMs: 2140, tokensIn: 9000, tokensOut: 600, cachedTokens: 4000, costUsd: 0.0251 },
        { feature: "narrate", label: "Status updates", model: "Haiku 5.5", calls: 1, failed: 0, avgLatencyMs: null, tokensIn: 300, tokensOut: 80, cachedTokens: 0, costUsd: 0.00007 },
      ],
      masked: 2,
      totalCostUsd: 0.02517,
    };
    render(<AiPanel ai={live} onChange={() => {}} />);
    const usage = screen.getByRole("list", { name: "Usage in this session" }).textContent ?? "";
    expect(usage).toContain("3 calls (1 fell back) · 2.1 s · $0.03");
    expect(usage).toContain("1 call · $0.0001");
    expect(usage).toContain("Estimated cost so far$0.03");
    expect(screen.getByText("2 personal numbers masked before text went to Claude.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use your own Claude key" })).toBeTruthy();
  });

  it("hides the key option when the deployment turns it off", () => {
    render(<AiPanel ai={{ ...offline, byok: false }} onChange={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tests a key, keeps it in this tab only, and tells the stage to refresh", async () => {
    const fetchMock = fetchReturning({ ok: true, models: [{ id: "a", name: "Haiku 5.5", available: false }, { id: "b", name: "Sonnet 5.5", available: true }] });
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(<AiPanel ai={offline} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Try it with your own Claude key" }));
    const dialog = screen.getByRole("dialog", { name: "Try Navo with live Claude" });
    const input = screen.getByLabelText("Anthropic API key");
    expect(input.getAttribute("type")).toBe("password");
    const test = screen.getByRole("button", { name: "Test connection" }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: "not-a-key" } });
    expect(test.disabled).toBe(true);
    fireEvent.change(input, { target: { value: KEY } });
    expect(test.disabled).toBe(false);
    fireEvent.click(test);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("This key works. Models it can use: Sonnet 5.5."));
    // The key travels in a header to Navo's own endpoint, never in a body or a URL.
    expect(fetchMock).toHaveBeenCalledWith("/api/ai", { method: "POST", headers: { "x-navo-claude-key": KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Use this key" }));
    expect(sessionStorage.getItem("navo.claudeKey")).toBe(KEY);
    expect(localStorage.length).toBe(0);
    expect(onChange).toHaveBeenCalledOnce();
    expect(dialog.isConnected).toBe(false);
  });

  it("shows why a key failed, and closes on Escape or Cancel", async () => {
    vi.stubGlobal("fetch", fetchReturning({ ok: false, error: "Anthropic rejected this key. Check that you copied all of it." }, false));
    render(<AiPanel ai={offline} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Try it with your own Claude key" }));
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("rejected this key"));
    expect(screen.queryByRole("button", { name: "Use this key" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try it with your own Claude key" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports a network failure and a browser that blocks session storage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<AiPanel ai={offline} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Try it with your own Claude key" }));
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Couldn't reach Navo's server. Try again."));

    vi.stubGlobal("fetch", fetchReturning({ ok: true, models: [{ id: "b", name: "Sonnet 5.5", available: true }] }));
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: `${KEY}x` } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByRole("button", { name: "Use this key" });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this key" }));
    expect(screen.getByRole("status").textContent).toContain("blocks session storage");
    setItem.mockRestore();
  });

  it("disconnects a visitor key", () => {
    sessionStorage.setItem("navo.claudeKey", KEY);
    const onChange = vi.fn();
    render(<AiPanel ai={{ ...offline, mode: "visitor" }} onChange={onChange} />);
    expect(screen.getByRole("region", { name: "AI models and usage" }).textContent).toContain("Claude live · your key");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect your key" }));
    expect(sessionStorage.getItem("navo.claudeKey")).toBeNull();
    expect(onChange).toHaveBeenCalledOnce();
  });
});
