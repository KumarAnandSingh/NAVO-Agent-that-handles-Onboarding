"use client";

import { COMPANY } from "@/content/company";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import s from "./hr.module.css";

/** Priya's view: a queue of exceptions Navo couldn't resolve, not a checklist per joiner. */
export function HrConsole({ fullscreen = false }: { fullscreen?: boolean }) {
  const { vm, hr, busy, replay, liveFace } = useNavo();
  if (!vm) {
    return (
      <section className={`${s.console} ${fullscreen ? s.fullscreen : ""}`} aria-label="HR console">
        <div style={{ gridColumn: "1 / -1", display: "grid", placeItems: "center" }}>
          <NavoFace state="thinking" size={64} />
        </div>
      </section>
    );
  }
  const h = vm.hr;
  const working = busy || Boolean(replay);
  const featuredTone = TONE[h.featured.tone];
  const hrFirst = vm.employee.hrName.split(" ")[0] ?? "there";
  return (
    <section className={`${s.console} ${fullscreen ? s.fullscreen : ""}`} aria-label="HR console">
      <nav className={s.nav} aria-label="HR navigation">
        <div className={s.brand}>
          <NavoFace state="brand" size={30} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{COMPANY.product}</span>
            <span style={{ fontSize: 11, color: "var(--text-on-navy-3)" }}>{COMPANY.tagline}</span>
          </span>
        </div>
        <div className={s.navItems}>
          <span className={s.navOn}>Needs HR · {h.counts.needHr}</span>
          <span className={s.navItem}>All joiners · {h.counts.joining}</span>
          <span className={s.navItem}>Navo activity</span>
          <span className={s.navItem}>Policies and rules</span>
        </div>
        <div className={s.me}>
          <span className={s.meAvatar}>
            {vm.employee.hrName
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </span>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{vm.employee.hrName}</span>
            <span style={{ fontSize: 11, color: "var(--text-on-navy-3)" }}>HR · Mumbai</span>
          </span>
        </div>
      </nav>

      <div className={s.main}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className={s.muted}>{vm.clock.dayClock}</span>
          <h1 className={s.title}>
            Good {partOfDay(vm.clock.time)}, {hrFirst}. {h.headline}
          </h1>
        </div>
        <div className={s.counts}>
          <div className={s.count}>
            <span className={s.countN}>{h.counts.joining}</span>
            <span className={s.muted}>Joining in 30 days</span>
          </div>
          <div className={s.count}>
            <span className={s.countN} style={{ color: "var(--done)" }}>
              {h.counts.onTrack}
            </span>
            <span className={s.muted}>On track</span>
          </div>
          <div className={s.count}>
            <span className={s.countN} style={{ color: "var(--risk)" }}>
              {h.counts.needHr}
            </span>
            <span className={s.muted}>Need HR</span>
          </div>
          <div className={s.count} style={{ boxShadow: "inset 0 0 0 1px rgba(56,189,248,.45)" }}>
            <span className={s.countN} style={{ color: "var(--accent)" }}>
              {h.counts.resolvedByNavo}
            </span>
            <span className={s.muted}>Actions by Navo this week</span>
          </div>
        </div>

        <div className={s.block}>
          <span className={s.label}>Needs your decision</span>
          {h.queue.length === 0 && <span className={s.muted}>Nothing needs you. Navo is handling the rest.</span>}
          {h.queue.map((q) => (
            <div key={q.id} className={s.queueItem} style={{ boxShadow: q.highlight === "risk" ? "0 0 0 1.5px var(--risk)" : q.highlight === "agent" ? "0 0 0 1.5px var(--accent)" : "none" }}>
              <span className={s.initials}>{q.initials}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{q.title}</span>
                <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
                  {q.who} · {q.body}
                </span>
                <span style={{ fontSize: 12, color: "var(--accent)" }}>Navo: {q.navo}</span>
              </div>
              {q.action === "generate_id" ? (
                <button className={s.cta} disabled={working} onClick={() => hr({ action: "generate_id" })}>
                  {working ? "Working…" : q.cta}
                </button>
              ) : (
                <button className={s.cta} disabled title="Shown for context in this prototype">
                  {q.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={s.block}>
          <span className={s.label}>Upcoming joiners</span>
          <div className={s.table} role="table" aria-label="Upcoming joiners">
            <div className={`${s.tableRow} ${s.tableHead}`} role="row">
              <span role="columnheader">Joiner</span>
              <span role="columnheader">Starts</span>
              <span role="columnheader">Open items</span>
              <span role="columnheader">Day 1</span>
            </div>
            {h.joiners.map((j) => (
              <div key={j.name} className={s.tableRow} role="row">
                <span role="cell" style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{j.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>{j.role}</span>
                </span>
                <span role="cell">{j.start}</span>
                <span role="cell" style={{ fontSize: 12, color: "var(--text-2)" }}>
                  {j.open}
                </span>
                <span role="cell" style={{ fontSize: 12, fontWeight: 600, color: TONE[j.tone].ink }}>
                  {j.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className={s.side} aria-label={`${vm.employee.name} live`}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NavoFace state={liveFace} size={34} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{vm.employee.name} · live</span>
            <span className={s.muted}>
              Starts {vm.employee.day1} · {h.featured.status}
            </span>
          </span>
        </div>
        <div className={s.sees} style={{ background: h.featured.tone === "done" ? "#E3F2EC" : h.featured.tone === "risk" ? "#FFF7EB" : "#F6F8FC" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: featuredTone.ink }}>WHAT HR SEES</span>
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{h.featured.note}</span>
        </div>
        <span className={s.label}>Navo activity on this joiner</span>
        <ol className={s.feed}>
          {h.featured.feed.map((e, i) => (
            <li key={i} className={s.feedRow}>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{e.time}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: TONE[e.tone].ink }}>{e.phase}</span>
                <span style={{ fontSize: 12, lineHeight: 1.4 }}>{e.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

function partOfDay(time: string): string {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
