import { claudeNarrator } from "@/agent/claude-narrator";
import { templateNarrator } from "@/agent/narration";
import { claudeReader } from "@/services/documents/claude-reader";
import { fixtureReader } from "@/services/documents/reader";
import type { ActionDeps } from "@/services/employee-actions";
import { claudeCreate, liveAiEnabled, NAVO_MODEL } from "@/services/llm/claude";

export { liveAiEnabled };

/** The model shown in the runtime panel, or null in offline mode. */
export function liveModel(): string | null {
  return liveAiEnabled() ? NAVO_MODEL : null;
}

/** Dependencies for live agent runs: Claude-backed when a key is configured, deterministic otherwise. */
export function agentDeps(): ActionDeps {
  const create = claudeCreate();
  if (!create) return { narrator: templateNarrator, reader: fixtureReader };
  return { narrator: claudeNarrator(create), reader: claudeReader(create) };
}
