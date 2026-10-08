"use client";

import type { Tone, ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import p from "../phone.module.css";
import s from "./screens.module.css";

const BAR: Record<Tone, string> = { done: "#13795B", wait: "#D97706", muted: "#E2E7EF", agent: "#2F5BEA", risk: "#C2410C", you: "#E5484D", calm: "#0B1530" };
const OWNER_INK: Record<string, string> = { HR: "var(--owner-hr)", IT: "var(--owner-it)" };

export function IdTrackerScreen({ vm }: { vm: ViewModel }) {
  const { go, liveFace, replay } = useNavo();
  const idt = vm.idTracker;
  return (
    <div className={p.screen}>
      <button className={p.back} onClick={() => go("home")}>
        ‹ Home
      </button>
      <div className={p.kickerRow}>
        <NavoFace state={replay ? liveFace : idt.face} size={42} />
        <span className={p.kicker} style={{ color: TONE[idt.tone].ink }}>
          {idt.kicker}
        </span>
      </div>
      <div className={p.titleBlock}>
        <h1 className={p.headline}>{idt.head}</h1>
        <p className={p.sub}>{idt.sub}</p>
      </div>
      <div className={s.bars} role="list" aria-label="Employee ID progress">
        {idt.bars.map((bar) => (
          <div key={bar.label} className={p.stack2} style={{ gap: 6 }} role="listitem" aria-current={bar.current ? "step" : undefined}>
            <div className={s.bar} style={{ background: BAR[bar.tone] }} />
            <span className={s.barLabel} style={{ fontWeight: bar.current ? 700 : 400 }}>
              {bar.label}
            </span>
          </div>
        ))}
      </div>
      <div className={p.panel} style={{ borderRadius: 18, gap: 0 }}>
        <span className={s.groupLabel} style={{ letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 8 }}>
          What depends on it
        </span>
        {idt.deps.map((dep) => (
          <div key={dep.name} className={s.depRow}>
            <span style={{ color: "var(--ink-soft)" }}>{dep.name}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline", textAlign: "right" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: OWNER_INK[dep.owner] }}>{dep.owner}</span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{dep.status}</span>
            </span>
          </div>
        ))}
      </div>
      <div className={s.facts}>
        <span style={{ color: "var(--text-3)" }}>Impact</span>
        <span style={{ fontWeight: 600, color: TONE[idt.tone].ink }}>{idt.impact}</span>
        <span style={{ color: "var(--text-3)" }}>Next</span>
        <span>{idt.next}</span>
      </div>
      <span className={p.bottom} style={{ fontSize: 16, fontWeight: 600, color: TONE[idt.footTone].ink }}>
        {idt.foot}
      </span>
    </div>
  );
}

export function JourneyScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  return (
    <div className={p.screen} style={{ gap: 14 }}>
      <button className={p.back} onClick={() => go("home")}>
        ‹ Home
      </button>
      <h1 className={p.headline} style={{ fontSize: 28 }}>
        Your journey so far
      </h1>
      <ol className={p.list} style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {vm.journey.map((step) => {
          const isDone = step.state === "done";
          const isNow = step.state === "now";
          return (
            <li key={step.name} className={s.timelineRow} aria-current={isNow ? "step" : undefined}>
              <span className={s.timelineRail}>
                <span
                  className={s.timelineDot}
                  style={{
                    background: isDone ? "var(--done)" : isNow ? "var(--signal)" : "#fff",
                    border: step.state === "upcoming" ? "2px solid #CBD2DD" : "none",
                    boxShadow: isNow ? "0 0 0 4px rgba(56,189,248,.2), 0 0 10px rgba(56,189,248,.8)" : "none",
                  }}
                />
                <span className={s.timelineLine} style={{ background: isDone ? "var(--done)" : "var(--line-2)" }} />
              </span>
              <span className={s.timelineBody}>
                <span className={s.timelineHead}>
                  <span style={{ fontSize: 15, fontWeight: isNow ? 700 : 500 }}>{step.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>{step.when}</span>
                </span>
                <span style={{ fontSize: 12, lineHeight: 1.4, color: isNow ? "var(--accent)" : "var(--text-3)" }}>{step.sub}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function UpdatesScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  const groups = [...new Set(vm.updates.map((u) => u.group))];
  return (
    <div className={p.screen} style={{ gap: 14 }}>
      <button className={p.back} onClick={() => go("home")}>
        ‹ Home
      </button>
      <div className={p.kickerRow}>
        <NavoFace state="calm" size={42} />
        <span className={p.muted}>Messages from Navo</span>
      </div>
      <h1 className={p.headline}>Updates</h1>
      {vm.updates.length === 0 && <p className={p.sub}>Nothing yet. I&apos;ll write when something changes.</p>}
      {groups.map((group) => (
        <section key={group} className={p.stack2} style={{ gap: 12 }}>
          <span className={s.groupLabel}>{group}</span>
          {vm.updates
            .filter((u) => u.group === group)
            .map((update) => (
              <article key={update.id} className={s.updateRow}>
                <span className={s.updateDot} style={{ background: update.needsYou ? "var(--you-dot)" : "var(--accent)" }} />
                <span className={p.stack2} style={{ gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{update.title}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-2)" }}>{update.body}</span>
                  {update.composedBy === "claude" && <span style={{ fontSize: 10, color: "var(--accent)" }}>Written by Claude from Navo&apos;s facts</span>}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>{update.time}</span>
              </article>
            ))}
        </section>
      ))}
    </div>
  );
}
