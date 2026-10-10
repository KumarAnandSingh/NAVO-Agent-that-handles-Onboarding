"use client";

import type { ToolCallVM } from "@/services/view-model/types";
import { AiPanel } from "@/ui/ai/AiPanel";
import { NavoFace } from "@/ui/components/NavoFace";
import { TOOL_HUMAN, faceForTool, useNavo } from "@/ui/state/NavoStore";
import { GUARD } from "@/ui/tones";
import st from "./stage.module.css";

function ToolCard({ tool, running }: { tool: ToolCallVM; running: boolean }) {
  const guard = GUARD[tool.status === "denied" ? "denied" : tool.guard];
  const failed = tool.status === "error" || tool.status === "timeout";
  return (
    <div className={`${st.tool} ${running ? st.toolRunning : ""}`}>
      <div className={st.toolHead}>
        <span className={st.toolName}>
          {tool.fn}
          <span className={st.toolArgs}>({tool.args})</span>
        </span>
        <span className={st.guard} style={{ color: guard.ink, background: guard.bg }}>
          {guard.label}
        </span>
      </div>
      <span className={`${st.toolResult} ${failed ? st.toolResultFailed : ""}`}>→ {running ? "running…" : tool.result}</span>
    </div>
  );
}

/** Right panel: Navo's real tool calls (replayed one by one), state changes and guardrails. */
export function RuntimePanel() {
  const { vm, replay, refresh } = useNavo();
  const runs = vm?.runtime.runs ?? [];
  const latest = runs[0];
  const current = replay ? replay.tools[replay.index] : undefined;
  const tools = replay ? replay.tools.slice(0, replay.index + 1) : (latest?.tools ?? []);
  const runState = replay ? "Running" : runs.length ? "Up to date" : "Idle";
  const runLine = current ? `${TOOL_HUMAN[current.fn] ?? current.fn}…` : latest ? (latest.summary ?? latest.trigger) : "Waiting for something to happen.";
  const runFace = current ? faceForTool(current.fn) : (vm?.home.face ?? "watching");

  return (
    <aside className={`${st.column} ${st.runtime}`} aria-label="Agent runtime">
      <div className={`${st.card} ${st.runtimeCard}`}>
        <div className={st.runHeader}>
          <span className={st.label}>Agent runtime</span>
          <span className={`${st.runState} ${replay ? st.runStateRunning : ""}`}>{runState}</span>
        </div>
        <div className={st.runLine} aria-live="polite">
          <NavoFace state={runFace} size={28} decorative />
          <span className={st.runLineText}>
            <span>{runLine}</span>
            {!replay && latest && (
              <span className={st.runTrigger}>
                {latest.trigger} · {latest.time}
              </span>
            )}
          </span>
        </div>
        {tools.length === 0 && <span className={st.runEmpty}>No tool calls yet. Run the pre-joining chapter to watch Navo reason and act.</span>}
        {tools.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} running={Boolean(replay) && i === tools.length - 1} />
        ))}
        {!replay && latest && latest.diff.length > 0 && (
          <div className={`${st.guardrails} ${st.stateChanges}`}>
            <span className={st.sectionTitle}>State changes</span>
            {latest.diff.map((line, i) => (
              <span key={i} className={st.diff}>
                {line}
              </span>
            ))}
          </div>
        )}
        {!replay && runs.length > 1 && (
          <div className={st.guardrails}>
            <span className={st.sectionTitle}>Earlier runs</span>
            {runs.slice(1).map((run) => (
              <span key={run.id} className={st.earlier}>
                <span>
                  <b>{run.time}</b> · {run.trigger}
                  {run.summary && run.summary !== run.trigger ? ` → ${run.summary}` : ""} · {run.tools.length} tool call{run.tools.length === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </div>
        )}
        <div className={st.guardrails}>
          <span className={st.sectionTitle}>Guardrails</span>
          <span>
            <span className={st.ruleAuto}>Auto</span> · read state and policy, reminders, IT tickets, scheduling, escalation after 24h
          </span>
          <span>
            <span className={st.ruleAsks}>Asks first</span> · personal data, bank details, equipment changes
          </span>
          <span>
            <span className={st.ruleNever}>Never</span> · issue Employee IDs or change start dates (HR only)
          </span>
        </div>
        {vm && <AiPanel ai={vm.runtime.ai} onChange={() => void refresh()} />}
      </div>
    </aside>
  );
}
