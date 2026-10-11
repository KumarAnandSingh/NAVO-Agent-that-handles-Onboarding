import { claudeNarrator } from "@/agent/claude-narrator";
import { templateNarrator } from "@/agent/narration";
import { CLAUDE_KEY_HEADER, CLAUDE_KEY_PATTERN } from "@/lib/claude-key";
import { claudeReader } from "@/services/documents/claude-reader";
import { fixtureReader } from "@/services/documents/reader";
import type { ActionDeps } from "@/services/employee-actions";
import { gateway, serverAccess, visitorAccess, type AiAccess } from "@/services/llm/gateway";

/** Visitors may connect their own Claude key unless the deployer switched it off. */
export function byokEnabled(): boolean {
  return process.env.NAVO_BYOK !== "off";
}

/** The visitor's key from this request, if they connected one and it looks like a key. */
export function visitorKey(request: Request): string | null {
  const key = request.headers.get(CLAUDE_KEY_HEADER)?.trim();
  return key && CLAUDE_KEY_PATTERN.test(key) ? key : null;
}

/**
 * How this request reaches Claude: the visitor's own key if they connected one, else the
 * deployment's key, else offline. The key is used for this request only, never stored or logged.
 */
export function aiAccess(request: Request): AiAccess {
  const key = byokEnabled() ? visitorKey(request) : null;
  return key ? visitorAccess(key) : serverAccess();
}

/** Dependencies for agent runs: Claude-backed when this request has access, deterministic otherwise. */
export function agentDeps(access: AiAccess): ActionDeps {
  const llm = gateway(access);
  if (!llm) return { narrator: templateNarrator, reader: fixtureReader };
  return { narrator: claudeNarrator(llm), reader: claudeReader(llm) };
}
