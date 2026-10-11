import { APIConnectionError, APIConnectionTimeoutError, APIError, AuthenticationError, InternalServerError, PermissionDeniedError, RateLimitError } from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { claudeNarrator } from "@/agent/claude-narrator";
import type { UpdateFacts } from "@/agent/narration";
import { CLAUDE_KEY_HEADER } from "@/lib/claude-key";
import { createMemoryDb, type Db } from "@/lib/db/client";
import { activities, agentRuns, llmUsage, toolCalls } from "@/lib/db/schema";
import { aiAccess, byokEnabled } from "@/server/deps";
import { askNavo } from "@/services/ask";
import { GLOBAL_DAILY_LIMIT, reserveLlmCall } from "@/services/llm/budget";
import { LlmUnavailable, OFFLINE, gateway, serverAccess, shouldFallBack } from "@/services/llm/gateway";
import { checkKey } from "@/services/llm/key-check";
import { MODELS } from "@/services/llm/models";
import { aiStatus, summariseUsage } from "@/services/llm/usage";
import { createWorkspace } from "@/services/workspace";
import { fakeClaude, text } from "./fake-claude";

let db: Db;

beforeAll(async () => {
  db = await createMemoryDb();
});

const fresh = async () => (await createWorkspace(db, "hr_responds")).id;
const usageRows = (ws: string) => db.select().from(llmUsage).where(eq(llmUsage.workspaceId, ws)).orderBy(asc(llmUsage.id));
const overloaded = () => new InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
const params = { max_tokens: 200, messages: [{ role: "user" as const, content: "Hello" }] };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI gateway", () => {
  it("routes each task to its model, effort and caching", async () => {
    const ws = await fresh();
    const claude = fakeClaude([[text("ok")]]);
    await claude.llm.call("narrate", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    await claude.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    await claude.llm.call("read_document", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    expect(claude.calls.map((c) => c.model)).toEqual([MODELS.haiku, MODELS.sonnet, MODELS.opus]);
    expect(claude.calls.map((c) => c.output_config?.effort)).toEqual(["low", "low", "low"]);
    expect(claude.calls.map((c) => c.cache_control?.type ?? null)).toEqual([null, "ephemeral", null]);
    const rows = await usageRows(ws);
    expect(rows.map((r) => [r.feature, r.model, r.status, r.keySource])).toEqual([
      ["narrate", MODELS.haiku, "ok", "server"],
      ["ask", MODELS.sonnet, "ok", "server"],
      ["read_document", MODELS.opus, "ok", "server"],
    ]);
    expect(rows.every((r) => r.latencyMs !== null && r.inputTokens === 120 && r.outputTokens === 40)).toBe(true);
  });

  it("falls back to the next model when one is overloaded or declines, and records every attempt", async () => {
    const ws = await fresh();
    const claude = fakeClaude([overloaded(), [text("from the fallback")]]);
    const reply = await claude.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    expect(reply.model).toBe(MODELS.opus);
    const declined = fakeClaude([{ content: [text("")], stop: "refusal" }, [text("answered")]]);
    const second = await declined.llm.call("narrate", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    expect(second.model).toBe(MODELS.sonnet);
    expect((await usageRows(ws)).map((r) => [r.model, r.status])).toEqual([
      [MODELS.sonnet, "failed"],
      [MODELS.opus, "ok"],
      [MODELS.haiku, "refused"],
      [MODELS.sonnet, "ok"],
    ]);
  });

  it("returns a refusal from the last model to the caller, which falls back to its rules", async () => {
    const ws = await fresh();
    const claude = fakeClaude([{ content: [text("")], stop: "refusal" }]);
    const reply = await claude.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    expect(reply.stop_reason).toBe("refusal");
    expect(claude.calls).toHaveLength(2);
  });

  it("does not fall back when the next model would fail the same way or the deadline is spent", async () => {
    const ws = await fresh();
    const rejected = new AuthenticationError(401, { type: "error", error: { type: "authentication_error" } }, "invalid x-api-key", new Headers());
    for (const error of [rejected, new APIConnectionTimeoutError(), new Error("bug")]) {
      const claude = fakeClaude([error]);
      await expect(claude.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 })).rejects.toBe(error);
      expect(claude.calls).toHaveLength(1);
    }
    // A fallback needs at least a second of the deadline left.
    const late = fakeClaude([overloaded(), [text("too late")]]);
    await expect(late.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 0 })).rejects.toThrow("Overloaded");
    expect(late.calls).toHaveLength(1);
  });

  it("classifies which errors are worth another model", () => {
    const status = (n: number) => APIError.generate(n, { type: "error", error: { type: "x" } }, "x", new Headers());
    expect([404, 429, 500, 503, 529].map((n) => shouldFallBack(status(n)))).toEqual([true, true, true, true, true]);
    expect([400, 401, 403, 413].map((n) => shouldFallBack(status(n)))).toEqual([false, false, false, false]);
    expect(shouldFallBack(new RateLimitError(429, undefined, "slow down", new Headers()))).toBe(true);
    expect(shouldFallBack(new APIConnectionError({ message: "reset" }))).toBe(true);
    expect(shouldFallBack(new APIConnectionTimeoutError())).toBe(false);
    expect(shouldFallBack("nope")).toBe(false);
  });

  it("masks personal numbers for narration, restores them in the reply, and logs only counts", async () => {
    const ws = await fresh();
    const facts: UpdateFacts = { kind: "blocker_cleared", facts: { blocker: "Employee ID", requests: "laptop request (IT-55231)" } };
    const claude = fakeClaude([
      (p) => {
        const sent = JSON.stringify(p);
        expect(sent).not.toContain("98765 43210");
        return [text("Your Employee ID came through, so I've sent the laptop request (IT-55231) to IT.")];
      },
    ]);
    await claude.llm.call("narrate", { db, workspaceId: ws }, { max_tokens: 100, messages: [{ role: "user", content: "Reach me on 98765 43210" }] }, { timeoutMs: 5_000 });
    expect(JSON.stringify(claude.calls[0])).toContain("[PHONE_1]");
    const narration = await claudeNarrator(claude.llm).employeeUpdate(facts, { db, workspaceId: ws });
    expect(narration.composedBy).toBe("claude");
    const [first] = await usageRows(ws);
    expect(first?.masked).toEqual({ PHONE: 1 });
    expect(JSON.stringify(await usageRows(ws))).not.toContain("98765");
  });

  it("does not mask document reading, which needs the real image and fields", async () => {
    const ws = await fresh();
    const claude = fakeClaude([[text("{}")]]);
    await claude.llm.call("read_document", { db, workspaceId: ws }, { max_tokens: 100, messages: [{ role: "user", content: "PAN ABCDE1234F" }] }, { timeoutMs: 5_000 });
    expect(JSON.stringify(claude.calls[0])).toContain("ABCDE1234F");
  });

  it("stops at the daily budget and tells the caller", async () => {
    const ws = await fresh();
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(llmUsage).values(Array.from({ length: GLOBAL_DAILY_LIMIT }, () => ({ day, workspaceId: null, feature: "ask" as const, status: "ok" as const })));
    const server = fakeClaude([[text("unused")]]);
    await expect(server.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 })).rejects.toBeInstanceOf(LlmUnavailable);
    expect(server.calls).toHaveLength(0);
    // A visitor's own key isn't held to the deployment's global cap, only to the per-workspace one.
    const visitor = fakeClaude([[text("on my key")]], "visitor");
    const reply = await visitor.llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    expect(reply.content).toEqual([expect.objectContaining({ text: "on my key" })]);
    expect((await usageRows(ws)).at(-1)?.keySource).toBe("visitor");
    expect(await reserveLlmCall(db, ws, "ask")).toBeNull();
    await db.delete(llmUsage).where(eq(llmUsage.day, day));
  });
});

describe("bring your own key", () => {
  const key = `sk-ant-api03-${"x".repeat(40)}`;
  const request = (headers: Record<string, string> = {}) => new Request("http://navo.test/api/state", { headers });

  it("uses the visitor's key when they connect one, else the server's key, else offline", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NAVO_BYOK", "");
    expect(aiAccess(request()).mode).toBe("offline");
    expect(aiAccess(request({ [CLAUDE_KEY_HEADER]: key })).mode).toBe("visitor");
    expect(aiAccess(request({ [CLAUDE_KEY_HEADER]: "not-a-key" })).mode).toBe("offline");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-server-key-for-tests-only-000000");
    expect(aiAccess(request()).mode).toBe("server");
    expect(aiAccess(request({ [CLAUDE_KEY_HEADER]: key })).mode).toBe("visitor");
    vi.stubEnv("NAVO_LIVE_AI", "off");
    expect(serverAccess().mode).toBe("offline");
    vi.stubEnv("NAVO_BYOK", "off");
    expect(byokEnabled()).toBe(false);
    expect(aiAccess(request({ [CLAUDE_KEY_HEADER]: key })).mode).toBe("offline");
    expect(gateway(OFFLINE)).toBeNull();
  });

  it("never stores or logs the visitor's key, even when Claude fails", async () => {
    const ws = await fresh();
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
    // The real per-request client, pointed at a closed port, so every call fails without leaving the machine.
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:9");
    const access = aiAccess(request({ [CLAUDE_KEY_HEADER]: key }));
    const answer = await askNavo(db, ws, "My phone is 98765 43210. What if HR doesn't respond?", { llm: gateway(access) });
    expect(answer.composedBy).toBe("fallback");
    const stored = JSON.stringify([
      await usageRows(ws),
      await db.select().from(agentRuns).where(eq(agentRuns.workspaceId, ws)),
      await db.select().from(toolCalls).where(eq(toolCalls.workspaceId, ws)),
      await db.select().from(activities).where(eq(activities.workspaceId, ws)),
    ]);
    expect(stored).not.toContain(key);
    expect(logs.join("\n")).not.toContain(key);
    expect((await usageRows(ws)).map((r) => [r.keySource, r.status])).toEqual([
      ["visitor", "failed"],
      ["visitor", "failed"],
    ]);
  });

  it("tests a key for free and reports what it can use", async () => {
    const ok = await checkKey(key, async (model) => {
      if (model === MODELS.haiku) throw APIError.generate(404, { type: "error", error: { type: "not_found_error" } }, "not found", new Headers());
      return { id: model };
    });
    expect(ok).toEqual({
      ok: true,
      models: [
        { id: MODELS.haiku, name: "Haiku 5.5", available: false },
        { id: MODELS.sonnet, name: "Sonnet 5.5", available: true },
        { id: MODELS.opus, name: "Opus 5.5", available: true },
      ],
    });
    const rejected = await checkKey(key, async () => {
      throw new AuthenticationError(401, undefined, "invalid x-api-key", new Headers());
    });
    expect(rejected).toEqual({ ok: false, error: expect.stringContaining("rejected this key") });
    const offline = await checkKey(key, async () => {
      throw new APIConnectionError({ message: "down" });
    });
    expect(offline).toEqual({ ok: false, error: expect.stringContaining("Couldn't reach") });
    const none = await checkKey(key, async () => {
      throw APIError.generate(404, undefined, "not found", new Headers());
    });
    expect(none).toEqual({ ok: false, error: expect.stringContaining("(404)") });
    const forbidden = await checkKey(key, async () => {
      throw new PermissionDeniedError(403, undefined, "forbidden", new Headers());
    });
    expect(forbidden).toEqual({ ok: false, error: "This key isn't allowed to use the Claude API." });
    const odd = await checkKey(key, async () => {
      throw new Error("socket hang up");
    });
    expect(odd).toEqual({ ok: false, error: "Couldn't check this key. Try again." });
  });
});

describe("AI usage panel", () => {
  it("sums calls, fallbacks, latency, tokens, cost and masked numbers per task and model", () => {
    const row = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1000, masked: null };
    const summary = summariseUsage([
      { ...row, feature: "ask", model: MODELS.sonnet, status: "ok", cacheReadTokens: 2000 },
      { ...row, feature: "ask", model: MODELS.sonnet, status: "failed", inputTokens: 0, outputTokens: 0, latencyMs: 3000 },
      { ...row, feature: "narrate", model: MODELS.haiku, status: "ok", masked: { PHONE: 2 } },
      { ...row, feature: "narrate", model: MODELS.haiku, status: "reserved" },
      { ...row, feature: "ask", model: null, status: "ok", latencyMs: null },
    ]);
    expect(summary.usage.map((u) => [u.label, u.model, u.calls, u.failed, u.avgLatencyMs])).toEqual([
      ["Status updates", "Haiku 5.5", 1, 0, 1000],
      ["Ask Navo", "Sonnet 5.5", 2, 1, 2000],
      ["Ask Navo", "unknown", 1, 0, null],
    ]);
    const ask = summary.usage[1]!;
    expect(ask).toMatchObject({ tokensIn: 3000, tokensOut: 100, cachedTokens: 2000 });
    // 1000 in × $2 + 100 out × $10 + 2000 cache reads × $0.20, per million.
    expect(ask.costUsd).toBeCloseTo(0.0034);
    expect(summary.usage[2]!.costUsd).toBeNull();
    expect(summary.masked).toBe(2);
    expect(summary.totalCostUsd).toBeCloseTo(0.0034 + 0.00015);
  });

  it("reports the mode, the routes and the workspace's own usage", async () => {
    const ws = await fresh();
    await fakeClaude([[text("ok")]], "visitor").llm.call("ask", { db, workspaceId: ws }, params, { timeoutMs: 5_000 });
    const status = await aiStatus(db, ws, { mode: "visitor", create: fakeClaude([]).create }, true);
    expect(status).toMatchObject({ mode: "visitor", byok: true, masked: 0 });
    expect(status.routes.map((r) => [r.label, r.models.join(" → ")])).toEqual([
      ["Status updates", "Haiku 5.5 → Sonnet 5.5"],
      ["Ask Navo", "Sonnet 5.5 → Opus 5.5"],
      ["Document reading", "Opus 5.5 → Sonnet 5.5"],
    ]);
    expect(status.usage).toHaveLength(1);
    expect((await aiStatus(db, await fresh(), OFFLINE, false)).usage).toEqual([]);
  });
});
