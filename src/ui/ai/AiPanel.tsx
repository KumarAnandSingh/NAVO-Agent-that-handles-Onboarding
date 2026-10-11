"use client";

import { useState } from "react";
import type { AiStatusVM } from "@/services/view-model/types";
import { forgetClaudeKey } from "@/ui/state/claude-key";
import { ConnectKeyDialog } from "./ConnectKeyDialog";
import s from "./ai.module.css";

const MODE: Record<AiStatusVM["mode"], string> = {
  offline: "Offline · Navo's rules, no AI key",
  server: "Claude live",
  visitor: "Claude live · your key",
};

const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Which model does what, what it has cost, and the visitor's own-key switch. */
export function AiPanel({ ai, onChange }: { ai: AiStatusVM; onChange: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const live = ai.mode !== "offline";

  return (
    <section className={s.panel} aria-label="AI models and usage">
      <div className={s.head}>
        <span className={s.title}>AI routing</span>
        <span className={s.status}>
          <span className={`${s.dot} ${live ? s.live : ""}`} />
          {MODE[ai.mode]}
        </span>
      </div>
      <ul className={s.rows}>
        {ai.routes.map((r) => (
          <li key={r.feature} className={s.row} title={r.why}>
            <span className={s.rowLabel}>{r.label}</span>
            <span className={s.rowValue}>
              {r.models[0]}
              {r.models.length > 1 && <span className={s.fallback}> → {r.models.slice(1).join(" → ")}</span>}
            </span>
          </li>
        ))}
      </ul>
      {ai.usage.length > 0 && (
        <ul className={s.rows} aria-label="Usage in this session">
          {ai.usage.map((u) => (
            <li key={`${u.feature}-${u.model}`} className={s.row}>
              <span className={s.rowLabel}>
                {u.label} · {u.model}
              </span>
              <span className={s.rowValue}>
                {u.calls} call{u.calls === 1 ? "" : "s"}
                {u.failed > 0 && ` (${u.failed} fell back)`}
                {u.avgLatencyMs !== null && ` · ${seconds(u.avgLatencyMs)}`} · {u.costUsd === null ? "n/a" : usd(u.costUsd)}
              </span>
            </li>
          ))}
          <li className={s.row}>
            <span className={s.rowLabel}>Estimated cost so far</span>
            <span className={s.rowValue}>{usd(ai.totalCostUsd)}</span>
          </li>
        </ul>
      )}
      {ai.masked > 0 && (
        <span className={s.note}>
          {ai.masked} personal number{ai.masked === 1 ? "" : "s"} masked before text went to Claude.
        </span>
      )}
      {ai.byok && ai.mode !== "visitor" && (
        <button className={s.linkButton} onClick={() => setConnecting(true)}>
          {live ? "Use your own Claude key" : "Try it with your own Claude key"}
        </button>
      )}
      {ai.mode === "visitor" && (
        <button
          className={s.linkButton}
          onClick={() => {
            forgetClaudeKey();
            onChange();
          }}
        >
          Disconnect your key
        </button>
      )}
      {connecting && <ConnectKeyDialog onClose={() => setConnecting(false)} onConnected={onChange} />}
    </section>
  );
}
