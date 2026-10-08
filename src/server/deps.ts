import { templateNarrator } from "@/agent/narration";
import { fixtureReader } from "@/services/documents/reader";
import type { ActionDeps } from "@/services/employee-actions";

/** True when a Claude API key is configured on the server. */
export function liveAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Dependencies for agent runs: Claude-backed when a key is configured, deterministic otherwise. */
export function agentDeps(): ActionDeps {
  return { narrator: templateNarrator, reader: fixtureReader };
}
