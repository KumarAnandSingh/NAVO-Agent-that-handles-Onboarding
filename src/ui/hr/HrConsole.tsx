"use client";

import { useState } from "react";
import { COMPANY } from "@/content/company";
import type { HrVM, ViewModel } from "@/services/view-model/types";
import { HomeLink } from "@/ui/components/HomeLink";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import { JoinersPage } from "./JoinersPage";
import { PoliciesPage } from "./PoliciesPage";
import s from "./hr.module.css";

type Page = "queue" | "joiners" | "policies";

/** Priya's view: a queue of exceptions Navo couldn't resolve, not a checklist per joiner. */
export function HrConsole({ fullscreen = false }: { fullscreen?: boolean }) {
  const { vm, liveFace } = useNavo();
  const [page, setPage] = useState<Page>("queue");
  if (!vm) {
    return (
      <section className={`${s.console} ${fullscreen ? s.fullscreen : ""}`} aria-label="HR console">
        <div className={s.loading}>
          <NavoFace state="thinking" size={64} />
        </div>
      </section>
    );
  }
  const h = vm.hr;
  const pages: { id: Page; label: string }[] = [
    { id: "queue", label: `Needs HR · ${h.counts.needHr}` },
    { id: "joiners", label: `All joiners · ${h.counts.joining}` },
    { id: "policies", label: "Policies and rules" },
  ];
  return (
    <section className={`${s.console} ${fullscreen ? s.fullscreen : ""}`} aria-label="HR console">
      <nav className={s.nav} aria-label="HR navigation">
        <div className={s.brand}>
          <NavoFace state="brand" size={30} />
          <span className={s.stack}>
            <span className={s.brandName}>{COMPANY.product}</span>
            <span className={s.onNavy}>{COMPANY.tagline}</span>
          </span>
        </div>
        {/* On its own page; on the demo stage the presenter panel has Home. */}
        {fullscreen && <HomeLink className={s.home} />}
        <div className={s.navItems}>
          {pages.map((p) => (
            <button key={p.id} className={page === p.id ? s.navOn : s.navItem} aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className={s.me}>
          <span className={s.meAvatar}>
            {vm.employee.hrName
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </span>
          <span className={s.stack}>
            <span className={s.meName}>{vm.employee.hrName}</span>
            <span className={s.onNavy}>HR · Mumbai</span>
          </span>
        </div>
      </nav>

      <div className={s.main}>
        {page === "queue" && <QueuePage vm={vm} />}
        {page === "joiners" && <JoinersPage hr={h} />}
        {page === "policies" && <PoliciesPage policies={h.policies} />}
      </div>

      <aside className={s.side} aria-label={`${vm.employee.name} live`}>
        <div className={s.liveHead}>
          <NavoFace state={liveFace} size={34} />
          <span className={s.stack}>
            <span className={s.liveName}>{vm.employee.name} · live</span>
            <span className={s.muted}>
              Starts {vm.employee.day1} · {h.featured.status}
            </span>
          </span>
        </div>
        <div className={`${s.sees} ${s[`sees_${h.featured.tone}`] ?? ""}`}>
          <span className={s.seesLabel} style={{ color: TONE[h.featured.tone].ink }}>
            WHAT HR SEES
          </span>
          <span className={s.seesText}>{h.featured.note}</span>
        </div>
        <span className={s.label}>Navo activity on this joiner</span>
        <ol className={s.feed}>
          {h.featured.feed.map((e, i) => (
            <li key={i} className={s.feedRow}>
              <span className={s.feedTime}>{e.time}</span>
              <span className={s.feedBody}>
                <span className={s.feedPhase} style={{ color: TONE[e.tone].ink }}>
                  {e.phase}
                </span>
                <span className={s.feedText}>{e.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

function QueuePage({ vm }: { vm: ViewModel }) {
  const { hr, busy, replay } = useNavo();
  const h = vm.hr;
  const working = busy || Boolean(replay);
  const hrFirst = vm.employee.hrName.split(" ")[0] ?? "there";
  return (
    <>
      <div className={s.greeting}>
        <span className={s.muted}>{vm.clock.dayClock}</span>
        <h1 className={s.title}>
          Good {partOfDay(vm.clock.time)}, {hrFirst}. {h.headline}
        </h1>
      </div>
      <Counts counts={h.counts} />

      <div className={s.block}>
        <span className={s.label}>Needs your decision</span>
        {h.queue.length === 0 && <span className={s.muted}>Nothing needs you. Navo is handling the rest.</span>}
        {h.queue.map((q) => (
          <div key={q.id} className={`${s.queueItem} ${q.highlight === "risk" ? s.ringRisk : q.highlight === "agent" ? s.ringAgent : ""}`}>
            <span className={s.initials}>{q.initials}</span>
            <div className={s.queueText}>
              <span className={s.queueTitle}>{q.title}</span>
              <span className={s.queueBody}>
                {q.who} · {q.body}
              </span>
              <span className={s.queueNavo}>Navo: {q.navo}</span>
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
    </>
  );
}

export function Counts({ counts }: { counts: HrVM["counts"] }) {
  return (
    <div className={s.counts}>
      <div className={s.count}>
        <span className={s.countN}>{counts.joining}</span>
        <span className={s.muted}>Joining in 30 days</span>
      </div>
      <div className={s.count}>
        <span className={`${s.countN} ${s.countDone}`}>{counts.onTrack}</span>
        <span className={s.muted}>On track</span>
      </div>
      <div className={s.count}>
        <span className={`${s.countN} ${s.countRisk}`}>{counts.needHr}</span>
        <span className={s.muted}>Need HR</span>
      </div>
      <div className={`${s.count} ${s.countNavo}`}>
        <span className={`${s.countN} ${s.countAccent}`}>{counts.resolvedByNavo}</span>
        <span className={s.muted}>Actions by Navo this week</span>
      </div>
    </div>
  );
}

function partOfDay(time: string): string {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
