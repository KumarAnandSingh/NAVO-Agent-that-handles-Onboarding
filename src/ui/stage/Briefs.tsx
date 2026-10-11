"use client";

import { COMPANY } from "@/content/company";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { CHAPTERS } from "./chapters";
import { useGuide } from "./Guide";
import st from "./guide.module.css";

const INTRO_CHAPTERS = [
  ["Meet Navo", "Sign in, set the rules"],
  ["Documents and forms", "Navo reads, asks only what's unclear"],
  ["Navo at work", "The late Employee ID"],
  ["Ready for Day 1", "One pickup"],
  ["Day 1", "Plan and confirm"],
  ["Weeks 1–4", "Benefits, check-in"],
] as const;

/** The opening brief: who's who, the six chapters, and what to watch for. */
export function IntroBrief() {
  const { overlay, setOverlay, play } = useGuide();
  const { vm, go } = useNavo();
  if (overlay !== "intro") return null;
  const e = vm?.employee;
  const people = [
    { initials: e?.initials ?? "AM", name: e?.name ?? "Anand Mehta", role: `New joiner · ${e?.role ?? "Senior Product Manager"} · starts ${e?.day1 ?? "Mon 19 Oct"}`, avatar: st.avatarJoiner, ring: true },
    { initials: "PN", name: e?.hrName ?? "Priya Nair", role: `HR onboarding owner · ${vm?.impact.joiners ?? 14} joiners this month`, avatar: st.avatarHr },
    { initials: "RI", name: e?.managerName ?? "Rahul Iyer", role: "Hiring manager", avatar: st.avatarManager },
    { initials: "MS", name: e?.buddyName ?? "Meera Shah", role: "Buddy, same team", avatar: st.avatarBuddy },
  ];
  const explore = () => {
    setOverlay(null);
    go("launch");
  };
  return (
    <div className={`${st.overlay} ${st.intro}`} role="dialog" aria-modal="true" aria-label="About this demo">
      <div className={st.sheet}>
        <div className={st.hero}>
          <NavoFace state="brand" size={96} />
          <div className={st.heroText}>
            <span className={`${st.kicker} ${st.heroKicker}`}>Demo · about 3 minutes</span>
            <h1 className={st.title}>
              {COMPANY.product}: {COMPANY.tagline}.
            </h1>
            <p className={st.lede}>{COMPANY.supportingLine} {COMPANY.name} is a made-up company and its people and records are sample data. {COMPANY.product}&apos;s agent engine, rules and workflows are real and run live on a simulated clock.</p>
            <div className={st.heroActions}>
              <button className={st.primaryButton} onClick={play} autoFocus>
                ▶ Play guided demo
              </button>
              <button className={st.ghostButton} onClick={explore}>
                Explore on my own
              </button>
            </div>
          </div>
        </div>

        <div className={st.block}>
          <span className={`${st.kicker} ${st.blockKicker}`}>Who you&apos;ll meet</span>
          <div className={st.people}>
            {people.map((p) => (
              <div key={p.name} className={`${st.person} ${p.ring ? st.personJoiner : ""}`}>
                <span className={`${st.avatar} ${p.avatar}`}>{p.initials}</span>
                <span className={st.personText}>
                  <span className={st.personName}>{p.name}</span>
                  <span className={st.personRole}>{p.role}</span>
                </span>
              </div>
            ))}
            <div className={`${st.person} ${st.personNavo}`}>
              <NavoFace state="watching" size={44} />
              <span className={st.personText}>
                <span className={st.personName}>{COMPANY.product}</span>
                <span className={st.personRole}>The onboarding agent working for both</span>
              </span>
            </div>
          </div>
        </div>

        <div className={st.columns}>
          <div className={st.block}>
            <span className={`${st.kicker} ${st.blockKicker}`}>The story in 6 chapters</span>
            <div>
              {INTRO_CHAPTERS.map(([what, when], i) => (
                <div key={what} className={`${st.chapterRow} ${i === 2 ? st.chapterRowKey : ""}`}>
                  <span className={st.chapterDot}>{i + 1}</span>
                  <span className={st.chapterName}>{what}</span>
                  <span className={st.chapterWhen}>{i === 0 ? when : `${when} · ${CHAPTERS[i]?.when}`}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={st.block}>
            <span className={`${st.kicker} ${st.blockKicker}`}>Watch for</span>
            <div className={st.watch}>
              <div className={st.watchHead}>
                <NavoFace state="concerned" size={32} />
                <span className={st.watchTitle}>The late Employee ID</span>
              </div>
              <span className={st.watchText}>
                HR is late with {e?.firstName ?? "Anand"}&apos;s Employee ID. His laptop, email and VPN all depend on it. Navo spots the risk, follows up, and escalates or asks{" "}
                {e?.firstName ?? "Anand"} for a decision, all within its rules.
              </span>
              <div className={st.chain}>
                <span>Employee ID</span>
                <b>→</b>
                <span>Laptop</span>
                <b>→</b>
                <span>Email, VPN</span>
                <b>→</b>
                <span>Day 1</span>
              </div>
            </div>
            <div className={st.legend}>
              <span>
                <span className={st.legendYou} />
                <b>YOU</b> needs Anand
              </span>
              <span>
                <NavoFace state="watching" size={16} decorative />
                <b>NAVO</b> is on it
              </span>
              <span>
                <span className={st.legendDone} />
                <b>DONE</b>
              </span>
              <span>
                <span className={st.legendWaiting} />
                <b>WAITING</b> on a team
              </span>
            </div>
          </div>
        </div>

        <div className={st.footer}>
          <span className={st.disclaimer}>{COMPANY.disclaimer}</span>
          <span className={st.footerActions}>
            <span className={st.shortcuts}>Space to play · → next step · B brief</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The closing screen: what Navo did in this run, computed from the run itself. */
export function ImpactOutro() {
  const { overlay, setOverlay } = useGuide();
  const { vm, demo, go } = useNavo();
  if (overlay !== "outro" || !vm) return null;
  const i = vm.impact;
  const restart = async () => {
    if (await demo({ action: "reset" })) {
      go("launch");
      setOverlay("intro");
    }
  };
  const stats = [
    { n: `${i.byNavo} of ${i.tasksDone}`, label: "completed tasks closed by Navo and the teams it coordinated", accent: true },
    i.riskCaughtDaysBefore !== null
      ? { n: `${i.riskCaughtDaysBefore} days`, label: "before Day 1 Navo acted on the Day-1 risk" }
      : { n: "0", label: "Day-1 risks in this run" },
    { n: String(i.followUpsSent), label: `follow-up${i.followUpsSent === 1 ? "" : "s"} Navo sent for him, each with a deadline and a reason` },
    { n: String(i.byYou), label: `thing${i.byYou === 1 ? "" : "s"} that needed ${vm.employee.firstName}, each at the right moment` },
  ];
  return (
    <div className={`${st.overlay} ${st.outro}`} role="dialog" aria-modal="true" aria-label="Impact">
      <div className={`${st.sheet} ${st.outroSheet}`}>
        <div className={st.outroHead}>
          <NavoFace state="celebrating" size={88} />
          <div className={st.outroHeadText}>
            <span className={`${st.kicker} ${st.outroKicker}`}>{vm.employee.firstName}&apos;s first 30 days</span>
            <h1 className={st.title}>Navo did the coordinating. People made the decisions.</h1>
          </div>
        </div>
        <div className={st.stats}>
          {stats.map((s) => (
            <div key={s.label} className={st.stat}>
              <span className={`${st.statNumber} ${s.accent ? st.statNumberLead : ""}`}>{s.n}</span>
              <span className={st.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className={st.three}>
          <div>
            <b>For the joiner</b>Joining felt like one conversation. Only {i.byYou} things needed him.
          </div>
          <div>
            <b>For HR</b>A queue of exceptions, not a spreadsheet of {i.joiners} checklists.
          </div>
          <div>
            <b>For trust</b>
            {i.toolCalls} tool calls, each logged with a reason. Sensitive steps always asked first{i.askedFirst ? ` (${i.askedFirst} here)` : ""}.
          </div>
        </div>
        <div className={`${st.footer} ${st.outroFooter}`}>
          <span className={st.outroNote}>Figures computed from this simulated run.</span>
          <span className={st.outroActions}>
            <button className={st.darkGhost} onClick={() => setOverlay(null)}>
              Back to the demo
            </button>
            <button className={st.primaryButton} onClick={restart}>
              Restart
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
