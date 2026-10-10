"use client";

import type { JourneyStepVM, Tone, ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import p from "../phone.module.css";
import s from "./screens.module.css";

const BAR: Record<Tone, string> = { done: "#13795B", wait: "#D97706", muted: "#E2E7EF", agent: "#2F5BEA", risk: "#C2410C", you: "#E5484D", calm: "#0B1530" };
const OWNER_INK: Record<string, string> = { HR: "var(--owner-hr)", IT: "var(--owner-it)" };
const STEP: Record<JourneyStepVM["state"], string | undefined> = { done: s.stepDone, now: s.stepNow, upcoming: s.stepUpcoming };

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
          <div key={bar.label} className={s.barItem} role="listitem" aria-current={bar.current ? "step" : undefined}>
            <div className={s.bar} style={{ background: BAR[bar.tone] }} />
            <span className={`${s.barLabel} ${bar.current ? s.barLabelCurrent : ""}`}>{bar.label}</span>
          </div>
        ))}
      </div>
      <div className={`${p.panel} ${s.depPanel}`}>
        <span className={`${s.groupLabel} ${s.depLabel}`}>What depends on it</span>
        {idt.deps.map((dep) => (
          <div key={dep.name} className={s.depRow}>
            <span className={s.depName}>{dep.name}</span>
            <span className={s.depMeta}>
              <span className={s.ownerTag} style={{ color: OWNER_INK[dep.owner] }}>{dep.owner}</span>
              <span className={s.depStatus}>{dep.status}</span>
            </span>
          </div>
        ))}
      </div>
      <div className={s.facts}>
        <span className={s.factLabel}>Impact</span>
        <span className={s.factImpact} style={{ color: TONE[idt.tone].ink }}>{idt.impact}</span>
        <span className={s.factLabel}>Next</span>
        <span>{idt.next}</span>
      </div>
      <span className={`${p.bottom} ${s.trackerFoot}`} style={{ color: TONE[idt.footTone].ink }}>
        {idt.foot}
      </span>
    </div>
  );
}

export function JourneyScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  return (
    <div className={`${p.screen} ${s.listScreen}`}>
      <button className={p.back} onClick={() => go("home")}>
        ‹ Home
      </button>
      <h1 className={`${p.headline} ${s.journeyTitle}`}>Your journey so far</h1>
      <ol className={`${p.list} ${s.timeline}`}>
        {vm.journey.map((step) => (
          <li key={step.name} className={`${s.timelineRow} ${STEP[step.state]}`} aria-current={step.state === "now" ? "step" : undefined}>
            <span className={s.timelineRail}>
              <span className={s.timelineDot} />
              <span className={s.timelineLine} />
            </span>
            <span className={s.timelineBody}>
              <span className={s.timelineHead}>
                <span className={s.stepName}>{step.name}</span>
                <span className={s.stepWhen}>{step.when}</span>
              </span>
              <span className={s.stepSub}>{step.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function UpdatesScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  const groups = [...new Set(vm.updates.map((u) => u.group))];
  return (
    <div className={`${p.screen} ${s.listScreen}`}>
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
        <section key={group} className={s.updateGroup}>
          <span className={s.groupLabel}>{group}</span>
          {vm.updates
            .filter((u) => u.group === group)
            .map((update) => (
              <article key={update.id} className={s.updateRow}>
                <span className={`${s.updateDot} ${update.needsYou ? s.updateDotYou : ""}`} />
                <span className={s.updateText}>
                  <span className={s.itemTitle}>{update.title}</span>
                  <span className={s.updateBody}>{update.body}</span>
                  {update.composedBy === "claude" && <span className={s.updateByline}>Written by Claude from Navo&apos;s facts</span>}
                </span>
                <span className={s.updateTime}>{update.time}</span>
              </article>
            ))}
        </section>
      ))}
    </div>
  );
}
