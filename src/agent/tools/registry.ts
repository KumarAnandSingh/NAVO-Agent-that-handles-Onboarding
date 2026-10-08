import type { z } from "zod";
import { checkPermission, type PermissionContext } from "@/domain/permission-engine";
import type { Guard } from "@/domain/types";
import { toolCalls } from "@/lib/db/schema";
import type { AgentContext } from "../context";

export interface ToolResult<T = unknown> {
  /** One line for the runtime panel, e.g. "IT-55231 · delivery Fri 16 Oct". */
  summary: string;
  data: T;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: string;
  guard: Guard;
  input: S;
  summarizeArgs: (input: z.infer<S>) => string;
  run: (ctx: AgentContext, input: z.infer<S>) => Promise<ToolResult<O>>;
  /** Extra facts the permission engine needs (e.g. how long a reminder has been open). */
  permissionContext?: (ctx: AgentContext, input: z.infer<S>) => Promise<PermissionContext>;
  timeoutMs?: number;
}

export const DEFAULT_TOOL_TIMEOUT_MS = 5_000;

export class ToolValidationError extends Error {
  constructor(readonly tool: string, readonly issues: string) {
    super(`${tool}: invalid input (${issues})`);
    this.name = "ToolValidationError";
  }
}

export class ToolTimeoutError extends Error {
  constructor(readonly tool: string, readonly timeoutMs: number) {
    super(`${tool}: timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

export class ToolDeniedError extends Error {
  constructor(readonly tool: string, readonly reason: string) {
    super(`${tool}: denied (${reason})`);
    this.name = "ToolDeniedError";
  }
}

export function defineTool<S extends z.ZodType, O>(definition: ToolDefinition<S, O>): ToolDefinition<S, O> {
  return definition;
}

async function withTimeout<T>(work: Promise<T>, ms: number, tool: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolTimeoutError(tool, ms)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function record(
  ctx: AgentContext,
  tool: string,
  input: unknown,
  argsSummary: string,
  resultSummary: string,
  guard: Guard,
  status: "ok" | "error" | "denied" | "timeout",
  startedAt: number,
): Promise<void> {
  await ctx.db.insert(toolCalls).values({
    workspaceId: ctx.workspace.id,
    runId: ctx.runId,
    seq: ctx.seq,
    tool,
    args: (input && typeof input === "object" ? input : { value: input }) as Record<string, unknown>,
    argsSummary,
    resultSummary,
    guard,
    status,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    at: ctx.clock,
  });
}

/**
 * Run a tool on behalf of the agent: validate input, enforce the permission engine for
 * acting tools, apply a timeout, and write an audit row whatever the outcome.
 */
export async function callTool<S extends z.ZodType, O>(
  ctx: AgentContext,
  tool: ToolDefinition<S, O>,
  rawInput: unknown,
): Promise<ToolResult<O>> {
  ctx.seq += 1;
  const startedAt = performance.now();
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    await record(ctx, tool.name, rawInput, "(invalid)", `invalid input · ${issues}`, tool.guard, "error", startedAt);
    throw new ToolValidationError(tool.name, issues);
  }
  const input = parsed.data;
  const argsSummary = tool.summarizeArgs(input);

  if (tool.guard === "auto") {
    const permissionContext = tool.permissionContext ? await tool.permissionContext(ctx, input) : {};
    const decision = checkPermission(tool.name, permissionContext);
    if (decision.decision !== "allow") {
      await record(ctx, tool.name, input, argsSummary, `denied · ${decision.reason}`, "denied", "denied", startedAt);
      throw new ToolDeniedError(tool.name, decision.reason);
    }
  }

  try {
    const result = await withTimeout(tool.run(ctx, input), tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS, tool.name);
    await record(ctx, tool.name, input, argsSummary, result.summary, tool.guard, "ok", startedAt);
    return result;
  } catch (error) {
    const timedOut = error instanceof ToolTimeoutError;
    const message = error instanceof Error ? error.message : String(error);
    await record(ctx, tool.name, input, argsSummary, timedOut ? "timed out" : `error · ${message}`, tool.guard, timedOut ? "timeout" : "error", startedAt);
    throw error;
  }
}

/** Render tool arguments the way the runtime panel shows them: key="value". */
export function formatArgs(args: Record<string, string | number | undefined | null>): string {
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ");
}
