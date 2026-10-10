"use client";

import { useState } from "react";
import type { HrVM } from "@/services/view-model/types";
import { TONE } from "@/ui/tones";
import s from "./hr.module.css";
import r from "./radar.module.css";

/**
 * The cohort radar: Day-1 risk for everyone joining in the next 30 days, from the same
 * rules Navo applies to each joiner, and what would change if a team slowed down.
 */
export function JoinersPage({ hr }: { hr: HrVM }) {
  const scenarios = hr.radar.scenarios;
  const [selected, setSelected] = useState(scenarios[0]?.id ?? "today");
  const scenario = scenarios.find((x) => x.id === selected) ?? scenarios[0];
  if (!scenario) return null;
  const widest = Math.max(1, ...scenario.bottlenecks.map((b) => b.joiners));

  return (
    <>
      <div className={s.greeting}>
        <h1 className={s.title}>All joiners</h1>
        <p className={r.lede}>Day-1 risk for everyone joining in the next 30 days, worked out by the same rules Navo uses for each joiner. Try a what-if to see where Day 1 would break.</p>
      </div>

      <div className={r.whatIf} role="group" aria-label="What if">
        <span className={s.label}>What if</span>
        <div className={r.options}>
          {scenarios.map((x) => (
            <button key={x.id} className={x.id === scenario.id ? r.optionOn : r.option} aria-pressed={x.id === scenario.id} onClick={() => setSelected(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <p className={r.summary} aria-live="polite">
        {scenario.summary}
      </p>

      <div className={r.levels}>
        {scenario.levels.map((l) => (
          <div key={l.level} className={r.level}>
            <span className={r.levelN} style={{ color: l.count ? TONE[l.tone].ink : "var(--text-4)" }}>
              {l.count}
            </span>
            <span className={s.muted}>{l.label}</span>
          </div>
        ))}
      </div>

      {scenario.bottlenecks.length > 0 && (
        <div className={s.block}>
          <span className={s.label}>Where Day 1 breaks</span>
          <ul className={r.bars} aria-label="Bottlenecks by team">
            {scenario.bottlenecks.map((b) => (
              <li key={b.team} className={r.bar}>
                <span className={r.barTeam}>{b.team}</span>
                <span className={r.barTrack}>
                  <span className={r.barFill} style={{ width: `${(100 * b.joiners) / widest}%`, background: TONE[b.tone].dot }} />
                </span>
                <span className={r.barValue}>
                  {b.joiners} joiner{b.joiners === 1 ? "" : "s"} · {b.worst.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.block}>
        <span className={s.label}>Joiners</span>
        <div className={s.table} role="table" aria-label="Joiners by Day-1 risk">
          <div className={`${s.tableRow} ${r.radarRow} ${s.tableHead}`} role="row">
            <span role="columnheader">Joiner</span>
            <span role="columnheader">Starts</span>
            <span role="columnheader">Day 1</span>
            <span role="columnheader">What sets it</span>
          </div>
          {scenario.joiners.map((j) => (
            <div key={j.id} className={`${s.tableRow} ${r.radarRow} ${j.changed ? r.changed : ""}`} role="row">
              <span role="cell" className={s.stack}>
                <span className={s.joinerName}>{j.name}</span>
                <span className={s.joinerRole}>{j.role}</span>
              </span>
              <span role="cell">{j.start}</span>
              <span role="cell" className={s.joinerStatus} style={{ color: TONE[j.tone].ink }}>
                {j.label}
                {j.changed && <span className={r.changedTag}>changed</span>}
              </span>
              <span role="cell" className={s.joinerOpen}>
                {j.driver}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
