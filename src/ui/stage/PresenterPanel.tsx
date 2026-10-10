"use client";

import { COMPANY } from "@/content/company";
import type { Chapter } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { CHAPTERS, HR_NOTICE, chapterOfScreen } from "./chapters";
import { useGuide } from "./Guide";
import st from "./stage.module.css";

const VM_CHAPTER: Record<Chapter, number> = { launch: 0, documents: 1, pre_joining: 2, ready: 3, day1: 4, week1: 5 };

/** Left panel: what to notice, chapter jumps, the HR scenario switch and the simulated clock. */
export function PresenterPanel() {
  const { vm, screen, view, setView, go, demo, busy, replay } = useNavo();
  const guide = useGuide();
  const working = busy || Boolean(replay) || guide.running;
  const current = screen === "home" && vm ? VM_CHAPTER[vm.chapter] : chapterOfScreen(screen);
  const scenario = vm?.workspace.scenario ?? "hr_responds";
  const hrCanAct = vm?.hr.queue.some((q) => q.action === "generate_id") && view === "emp";

  const jump = async (i: number) => {
    const chapter = CHAPTERS[i];
    if (!chapter) return;
    if (await demo({ action: "chapter", chapter: i })) go(chapter.screen);
  };
  const reset = async () => {
    if (await demo({ action: "reset" })) go("launch");
  };
  const advance = async () => {
    await demo({ action: "advance" });
  };

  return (
    <aside className={`${st.column} ${st.presenter}`} aria-label="Presenter controls">
      <div className={st.card}>
        <div className={st.brandRow}>
          <NavoFace state="brand" size={30} />
          <span className={st.brandText}>
            <span className={st.brandName}>{COMPANY.product}</span>
            <span className={st.small}>{COMPANY.tagline}</span>
            <span className={st.clock}>{vm?.clock.dayClock ?? "Loading…"}</span>
          </span>
        </div>

        <div className={st.buttons}>
          <button className={st.play} onClick={guide.toggle}>
            {guide.auto ? "❚❚ Pause guided demo" : "▶ Play guided demo"}
          </button>
          <button className={st.ghost} onClick={() => guide.setOverlay("intro")} title="Show the brief (B)">
            Brief
          </button>
        </div>
        <span className={`${st.small} ${st.keys}`}>Keys: → next · ← back · Space play/pause · H HR view · B brief · Esc close</span>

        <div className={st.notice}>
          <span className={st.noticeKicker}>WHAT TO NOTICE</span>
          <span className={st.noticeText}>{view === "hr" ? HR_NOTICE : CHAPTERS[current]?.notice}</span>
        </div>

        <div className={st.segmented} role="tablist" aria-label="Whose view">
          <button role="tab" aria-selected={view === "emp"} className={`${st.segment} ${view === "emp" ? st.segmentOn : ""}`} onClick={() => setView("emp")}>
            Employee
          </button>
          <button role="tab" aria-selected={view === "hr"} className={`${st.segment} ${view === "hr" ? st.segmentOn : ""}`} onClick={() => setView("hr")}>
            HR owner
          </button>
        </div>

        <nav className={st.upcoming} aria-label="Chapters">
          <span className={`${st.label} ${st.chaptersLabel}`}>Chapters</span>
          {CHAPTERS.map((chapter, i) => {
            const on = i === current && view === "emp";
            const done = i < current;
            return (
              <button key={chapter.name} className={`${st.chapter} ${on ? st.chapterOn : done ? st.chapterDone : ""}`} disabled={working} onClick={() => jump(i)} aria-current={on ? "step" : undefined}>
                <span className={st.chapterDot}>{done ? "✓" : i + 1}</span>
                <span className={`${st.brandText} ${st.chapterText}`}>
                  <span className={st.chapterName}>{chapter.name}</span>
                  <span className={st.small}>{chapter.when}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className={st.section}>
          <span className={st.label}>Agent scenario · Employee ID</span>
          <div className={st.segmented} role="radiogroup" aria-label="How HR behaves">
            {(["hr_responds", "hr_silent"] as const).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={scenario === id}
                className={`${st.segment} ${st.segmentSmall} ${scenario === id ? st.segmentOn : ""}`}
                disabled={working}
                onClick={() => demo({ action: "scenario", scenario: id })}
              >
                {id === "hr_responds" ? "HR responds" : "HR silent"}
              </button>
            ))}
          </div>

          {vm && vm.runtime.upcoming.length > 0 && (
            <div className={st.upcoming}>
              <span className={`${st.small} ${st.upNext}`}>Up next in the simulation</span>
              {vm.runtime.upcoming.slice(0, 4).map((e, i) => (
                <div key={i} className={st.upcomingRow}>
                  <span>{e.label}</span>
                  <span className={st.upcomingWhen}>{e.when}</span>
                </div>
              ))}
            </div>
          )}

          <div className={st.buttons}>
            <button className={st.advance} disabled={working} onClick={advance}>
              {working ? "Navo is working…" : "Advance time ▸"}
            </button>
            <button className={st.ghost} disabled={working} onClick={reset}>
              Reset
            </button>
          </div>
          <button className={st.ghost} disabled={working || vm?.workspace.itDelay} onClick={() => demo({ action: "it_delay" })} title="IT reports a two-working-day slip on the laptop">
            {vm?.workspace.itDelay ? "IT delay injected" : "Inject IT delay"}
          </button>
          {vm?.pendingApproval && (
            <span className={`${st.tip} ${st.tipWaiting}`}>
              Waiting on {vm.employee.firstName}. Approve the loaner in the app.
            </span>
          )}
          {hrCanAct && (
            <span className={`${st.tip} ${st.tipHint}`}>
              Tip: switch to HR owner and press Generate ID.
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
