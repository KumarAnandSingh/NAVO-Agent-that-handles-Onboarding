"use client";

import type { ToolCallVM } from "@/services/view-model/types";
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
      <span style={{ color: running ? "var(--accent)" : failed ? "var(--you)" : "var(--text-2)" }}>→ {running ? "running…" : tool.result}</span>
    </div>
  );
}

/** Right panel: Navo's real tool calls (replayed one by one), state changes and guardrails. */
export function RuntimePanel() {
  const { vm, replay } = useNavo();
  const runs = vm?.runtime.runs ?? [];
  const latest = runs[0];
  const current = replay ? replay.tools[replay.index] : undefined;
  const tools = replay ? replay.tools.slice(0, replay.index + 1) : (latest?.tools ?? []);
  const runState = replay ? "Running" : runs.length ? "Up to date" : "Idle";
  const runLine = current ? `${TOOL_HUMAN[current.fn] ?? current.fn}…` : latest ? (latest.summary ?? latest.trigger) : "Waiting for something to happen.";
  const runFace = current ? faceForTool(current.fn) : (vm?.home.face ?? "watching");

  return (
    <aside className={`${st.column} ${st.runtime}`} aria-label="Agent runtime">
      <div className={st.card} style={{ gap: 14 }}>
        <div className={st.runHeader}>
          <span className={st.label}>Agent runtime</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: replay ? "var(--accent)" : "var(--done)" }}>{runState}</span>
        </div>
        <div className={st.runLine} aria-live="polite">
          <NavoFace state={runFace} size={28} decorative />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{runLine}</span>
            {!replay && latest && (
              <span style={{ fontSize: 11, color: "var(--text-on-navy-3)" }}>
                {latest.trigger} · {latest.time}
              </span>
            )}
          </span>
        </div>
        {tools.length === 0 && <span style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.45 }}>No tool calls yet. Run the pre-joining chapter to watch Navo reason and act.</span>}
        {tools.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} running={Boolean(replay) && i === tools.length - 1} />
        ))}
        {!replay && latest && latest.diff.length > 0 && (
          <div className={st.guardrails} style={{ color: "var(--ink)" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>State changes</span>
            {latest.diff.map((line, i) => (
              <span key={i} className={st.diff}>
                {line}
              </span>
            ))}
          </div>
        )}
        {!replay && runs.length > 1 && (
          <div className={st.guardrails}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Earlier runs</span>
            {runs.slice(1).map((run) => (
              <span key={run.id} className={st.earlier}>
                <span>
                  <b style={{ fontWeight: 600 }}>{run.time}</b> · {run.trigger}
                  {run.summary && run.summary !== run.trigger ? ` → ${run.summary}` : ""} · {run.tools.length} tool call{run.tools.length === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </div>
        )}
        <div className={st.guardrails}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Guardrails</span>
          <span>
            <span style={{ color: "var(--done)", fontWeight: 600 }}>Auto</span> · read state and policy, reminders, IT tickets, scheduling, escalation after 24h
          </span>
          <span>
            <span style={{ color: "var(--you)", fontWeight: 600 }}>Asks first</span> · personal data, bank details, equipment changes
          </span>
          <span>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>Never</span> · issue Employee IDs or change start dates (HR only)
          </span>
        </div>
        {vm && (
          <span className={st.model}>
            <span className={st.modelDot} style={{ background: vm.runtime.liveAI ? "var(--done)" : "var(--text-4)" }} />
            {vm.runtime.liveAI ? `Claude live · ${vm.runtime.model}` : "Offline mode · deterministic fallbacks"}
          </span>
        )}
      </div>
    </aside>
  );
}
