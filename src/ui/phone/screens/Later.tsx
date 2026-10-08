"use client";

import { useState } from "react";
import { CULTURE_SLIDES } from "@/content/culture";
import type { ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import p from "../phone.module.css";
import s from "./screens.module.css";

export function CultureScreen() {
  const { go } = useNavo();
  const [index, setIndex] = useState(0);
  const slide = CULTURE_SLIDES[index] ?? CULTURE_SLIDES[0]!;
  const last = index === CULTURE_SLIDES.length - 1;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", animation: "npIn .35s ease" }}>
      <div
        className={s.slideImage}
        role="img"
        aria-label={`${slide.kicker} illustration`}
        style={{ background: `radial-gradient(260px 200px at 70% 30%, ${slide.art[1]}55, transparent 70%), linear-gradient(160deg, ${slide.art[0]}, #0B1530)` }}
      />
      <div style={{ flex: 1, padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className={s.slideBars}>
          {CULTURE_SLIDES.map((item, i) => (
            <div key={item.kicker} style={{ height: 3, borderRadius: 2, background: i <= index ? "var(--signal)" : "rgba(255,255,255,.2)" }} />
          ))}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--signal-2)" }}>
          {index + 1} of {CULTURE_SLIDES.length} · {slide.kicker}
        </span>
        <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.02em" }}>{slide.title}</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--text-on-navy-2)" }}>{slide.body}</p>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.06)" }}>
          <NavoFace state="calm" size={26} decorative />
          <span style={{ fontSize: 12, lineHeight: 1.4, color: "var(--text-on-navy)" }}>What to know before mandatory training.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => go("home")} style={{ background: "none", border: "none", color: "var(--text-on-navy-3)", fontSize: 14, padding: 0 }}>
            Close
          </button>
          <button
            onClick={() => (last ? go("home") : setIndex(index + 1))}
            style={{ background: "#fff", color: "var(--ink)", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 600 }}
          >
            {last ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WeekOneScreen({ vm }: { vm: ViewModel }) {
  const { go, demo, employee, busy } = useNavo();
  const week = vm.week1;
  const benefits = week.benefits;
  const remaining = week.items.length - week.doneCount;
  const toDay30 = async () => {
    if (await demo({ action: "day30" })) go("day30");
  };
  return (
    <div className={p.screen}>
      <NavoFace state="calm" size={50} />
      <div className={p.titleBlock}>
        <h1 className={p.headline}>{remaining === 0 ? "Your first week is done." : "Your first week is nearly done."}</h1>
        <p className={p.sub}>
          {week.doneCount} of {week.items.length} done.{remaining ? ` I'm setting up the last ${remaining === 1 ? "one" : remaining}.` : ""}
        </p>
      </div>
      <div className={p.list}>
        {week.items.map((item, i) => (
          <div key={item.name} className={p.row} style={{ gridTemplateColumns: "22px 1fr auto", padding: "10px 0", borderBottom: i === week.items.length - 1 ? "none" : undefined }}>
            {item.done ? <span className={s.greenCheck} style={{ width: 18, height: 18, fontSize: 10, margin: 0 }}>✓</span> : <NavoFace state="acting" size={20} decorative />}
            <span className={p.stack2} style={{ gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: item.done ? 400 : 600 }}>{item.name}</span>
              {item.sub && <span style={{ fontSize: 11, color: "var(--accent)" }}>{item.sub}</span>}
            </span>
            <span className={p.rowNote}>{item.day}</span>
          </div>
        ))}
      </div>
      {benefits && (
        <button className={s.nudge} onClick={() => go("benefits")}>
          <NavoFace state="thinking" size={26} decorative />
          <span className={p.stack2} style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{benefits.enrolled ? "Health cover enrolled" : `Health cover enrolment closes in ${benefits.daysLeft} day${benefits.daysLeft === 1 ? "" : "s"}`}</span>
            <span style={{ fontSize: 12, color: "#7A5418" }}>{benefits.enrolled ? `${benefits.covered} · confirmed` : "Relevant to you now · 1 min"}</span>
          </span>
          <span style={{ color: "var(--risk-ink)" }}>→</span>
        </button>
      )}
      {week.suggestion && (
        <div className={p.panel} style={{ gap: 10 }}>
          <div className={p.kickerRow} style={{ gap: 8 }}>
            <NavoFace state="thinking" size={22} decorative />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Navo suggests</span>
          </div>
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>{week.suggestion.text}</span>
          {!week.suggestion.booked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className={p.primary} style={{ borderRadius: 10, padding: "9px 16px", fontSize: 13 }} disabled={busy} onClick={() => employee({ action: "book_walkthrough" }, (next) => next.week1.suggestion?.booked ? "Booked. It's on your calendar." : null)}>
                Book it
              </button>
            </div>
          )}
        </div>
      )}
      <button className={p.link} disabled={busy} onClick={toDay30}>
        Skip to Day 30 ▸
      </button>
    </div>
  );
}

export function BenefitsScreen({ vm }: { vm: ViewModel }) {
  const { go, employee, ask, busy } = useNavo();
  const benefits = vm.week1.benefits;
  if (!benefits) {
    return (
      <div className={p.screen}>
        <button className={p.back} onClick={() => go("week1")}>
          ‹ Week 1
        </button>
        <h1 className={p.headline}>Benefits open after Day 1.</h1>
      </div>
    );
  }
  return (
    <div className={p.screen}>
      <button className={p.back} onClick={() => go("week1")}>
        ‹ Week 1
      </button>
      <div className={p.kickerRow}>
        <NavoFace state={benefits.enrolled ? "celebrating" : "thinking"} size={42} />
        <span className={p.muted}>Navo · relevant now</span>
      </div>
      <div className={p.titleBlock}>
        <h1 className={p.headline}>{benefits.enrolled ? "You're enrolled in health cover." : `Health cover enrolment closes in ${benefits.daysLeft} day${benefits.daysLeft === 1 ? "" : "s"}.`}</h1>
        <p className={p.sub}>{benefits.familyNote}</p>
      </div>
      <div className={p.panel} style={{ padding: "4px 16px", gap: 0 }}>
        {benefits.rows.map((row, i) => (
          <div key={row.label} className={s.depRow} style={{ padding: "12px 0", borderBottom: i === benefits.rows.length - 1 ? "none" : "1px solid #E6EAF1" }}>
            <span>{row.label}</span>
            <span style={{ fontWeight: 600, color: row.tone === "risk" ? "var(--risk-ink)" : undefined }}>{row.value}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 11, color: "var(--accent)" }}>{benefits.source}</span>
      <div className={p.bottom} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          className={p.primary}
          style={{ background: benefits.enrolled ? "var(--done)" : undefined }}
          disabled={busy || benefits.enrolled || !benefits.open}
          onClick={() => employee({ action: "enrol_benefits" }, "Enrolled. HR and the insurer are notified.")}
        >
          {benefits.enrolled ? "Enrolled ✓" : benefits.open ? "Enrol family" : "Opens closer to the deadline"}
        </button>
        <button className={p.secondary} onClick={() => ask("Can I add my parents to insurance?")}>
          Ask about parents&apos; cover
        </button>
      </div>
    </div>
  );
}

export function DayThirtyScreen({ vm }: { vm: ViewModel }) {
  const { employee } = useNavo();
  const d = vm.day30;
  const [picked, setPicked] = useState<number | null>(d.pulse);
  const manager = vm.employee.managerName.split(" ")[0] ?? "your manager";
  const pick = async (score: number) => {
    setPicked(score);
    await employee({ action: "pulse", score }, "Thanks. Shared anonymously with HR.");
  };
  return (
    <div className={p.screen}>
      <NavoFace state="celebrating" size={52} />
      <div className={p.titleBlock}>
        <h1 className={p.headline}>One month in, {vm.employee.firstName}.</h1>
        <p className={p.sub}>
          {d.open.length === 0 ? "Onboarding is complete." : `${d.open.length} item${d.open.length === 1 ? " is" : "s are"} still open: ${d.open.join(", ")}. I'm on ${d.open.length === 1 ? "it" : "them"}.`}
          {d.checkIn ? ` Your 30-day check-in with ${manager} is ${d.checkIn}.` : ""}
        </p>
      </div>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statNumber}>{d.tasksDone}</span>
          <span className={p.rowNote}>Tasks done</span>
        </div>
        <div className={s.stat} style={{ boxShadow: "inset 0 0 0 1px rgba(56,189,248,.45)" }}>
          <span className={s.statNumber} style={{ color: "var(--accent)" }}>
            {d.byNavo}
          </span>
          <span className={p.rowNote}>By Navo and teams</span>
        </div>
        <div className={s.stat}>
          <span className={s.statNumber}>{d.byYou}</span>
          <span className={p.rowNote}>By you</span>
        </div>
      </div>
      <div className={p.stack2} style={{ gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>I&apos;ve prepared your check-in</span>
        {d.checkIn && (
          <span style={{ display: "flex", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--done)" }}>✓</span>Booked with {manager} · {d.checkIn}
          </span>
        )}
        <span style={{ display: "flex", gap: 8, fontSize: 13 }}>
          <span style={{ color: "var(--done)" }}>✓</span>Your first-month summary, from the numbers above
        </span>
      </div>
      <div className={p.panel} style={{ background: "#fff", border: "1px solid var(--line-2)", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{picked ? "Thanks for telling me." : "How has joining felt?"}</span>
        <div className={s.pulse} role="radiogroup" aria-label="How has joining felt, 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} role="radio" aria-checked={picked === n} className={`${s.pulseButton} ${picked === n ? s.pulseOn : ""}`} onClick={() => pick(n)}>
              {n}
            </button>
          ))}
        </div>
        <span className={p.rowNote}>Goes to HR anonymously, to improve onboarding</span>
      </div>
      <span className={`${p.muted} ${p.bottom}`}>Next: {d.next}</span>
    </div>
  );
}
