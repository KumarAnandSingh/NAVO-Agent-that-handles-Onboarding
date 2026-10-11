/** The agent runtime panel: recent runs, their tool calls and state changes. */
import { formatDayClock, formatTime } from "@/domain/time";
import type { RuntimeVM } from "../types";
import type { Ctx } from "./context";
import type { PresentOptions } from "../present";

export function presentRuntime(ctx: Ctx, options: PresentOptions): RuntimeVM {
  const { state } = ctx;
  const runs = state.runs.map((run) => ({
    id: run.id,
    trigger: run.trigger,
    time: formatDayClock(run.startedAt),
    outcome: run.outcome,
    summary: run.summary,
    tools: state.toolCalls
      .filter((c) => c.runId === run.id)
      .map((c) => ({ id: c.id, runId: run.id, fn: c.tool, args: c.argsSummary, result: c.resultSummary, guard: c.guard, status: c.status, time: formatTime(c.at) })),
    diff: state.stateChanges
      .filter((s) => s.runId === run.id)
      .map((s) => (s.fromValue ? `${s.label}: ${s.fromValue} → ${s.toValue}` : `${s.label}: ${s.toValue}`)),
  }));
  return {
    runs,
    latestRunId: runs[0]?.id ?? null,
    upcoming: state.upcoming.map((e) => ({ label: e.label, when: formatDayClock(e.dueAt) })),
    ai: options.ai,
  };
}
