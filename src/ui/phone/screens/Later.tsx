"use client";

import { useState } from "react";
import { CULTURE_SLIDES } from "@/content/culture";
import type { ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useOptionalGuide } from "@/ui/stage/Guide";
import { useNavo } from "@/ui/state/NavoStore";
import p from "../phone.module.css";
import s from "./screens.module.css";

export function CultureScreen() {
  const { go } = useNavo();
  const [index, setIndex] = useState(0);
  const slide = CULTURE_SLIDES[index] ?? CULTURE_SLIDES[0]!;
  const last = index === CULTURE_SLIDES.length - 1;
  return (
    <div className={s.culture}>
      <div
        className={s.slideImage}
        role="img"
        aria-label={`${slide.kicker} illustration`}
        style={{ background: `radial-gradient(260px 200px at 70% 30%, ${slide.art[1]}55, transparent 70%), linear-gradient(160deg, ${slide.art[0]}, #0B1530)` }}
      />
      <div className={s.slideBody}>
        <div className={s.slideBars}>
          {CULTURE_SLIDES.map((item, i) => (
            <div key={item.kicker} className={`${s.slideBar} ${i <= index ? s.slideBarSeen : ""}`} />
          ))}
        </div>
        <span className={s.slideKicker}>
          {index + 1} of {CULTURE_SLIDES.length} · {slide.kicker}
        </span>
        <h1 className={s.slideTitle}>{slide.title}</h1>
        <p className={s.slideText}>{slide.body}</p>
        <div className={s.slideNote}>
          <NavoFace state="calm" size={26} decorative />
          <span className={s.slideNoteText}>What to know before mandatory training.</span>
        </div>
        <div className={s.slideNav}>
          <button className={s.slideClose} onClick={() => go("home")}>
            Close
          </button>
          <button className={s.slideNext} onClick={() => (last ? go("home") : setIndex(index + 1))}>
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
          <div key={item.name} className={`${p.row} ${s.weekRow} ${i === week.items.length - 1 ? p.rowLast : ""}`}>
            {item.done ? <span className={`${s.greenCheck} ${s.weekCheck}`}>✓</span> : <NavoFace state="acting" size={20} decorative />}
            <span className={s.itemText}>
              <span className={`${s.itemTitle} ${item.done ? s.itemTitleDone : ""}`}>{item.name}</span>
              {item.sub && <span className={s.itemSub}>{item.sub}</span>}
            </span>
            <span className={p.rowNote}>{item.day}</span>
          </div>
        ))}
      </div>
      {benefits && (
        <button className={s.nudge} onClick={() => go("benefits")}>
          <NavoFace state="thinking" size={26} decorative />
          <span className={s.nudgeText}>
            <span className={s.itemTitle}>{benefits.enrolled ? "Health cover enrolled" : `Health cover enrolment closes in ${benefits.daysLeft} day${benefits.daysLeft === 1 ? "" : "s"}`}</span>
            <span className={s.nudgeNote}>{benefits.enrolled ? `${benefits.covered} · confirmed` : "Relevant to you now · 1 min"}</span>
          </span>
          <span className={s.nudgeArrow}>→</span>
        </button>
      )}
      {week.suggestion && (
        <div className={`${p.panel} ${s.suggestion}`}>
          <div className={`${p.kickerRow} ${s.suggestionHead}`}>
            <NavoFace state="thinking" size={22} decorative />
            <span className={s.panelLabel}>Navo suggests</span>
          </div>
          <span className={s.panelText}>{week.suggestion.text}</span>
          {!week.suggestion.booked && (
            <div className={s.suggestionActions}>
              <button className={`${p.primary} ${s.bookButton}`} disabled={busy} onClick={() => employee({ action: "book_walkthrough" }, (next) => next.week1.suggestion?.booked ? "Booked. It's on your calendar." : null)}>
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
      <div className={`${p.panel} ${s.benefitsPanel}`}>
        {benefits.rows.map((row, i) => (
          <div key={row.label} className={`${s.depRow} ${s.benefitsRow} ${i === benefits.rows.length - 1 ? s.benefitsRowLast : ""}`}>
            <span>{row.label}</span>
            <span className={`${s.benefitsValue} ${row.tone === "risk" ? s.benefitsValueRisk : ""}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <span className={s.benefitsSource}>{benefits.source}</span>
      <div className={`${p.bottom} ${s.benefitsActions}`}>
        <button
          className={`${p.primary} ${benefits.enrolled ? s.enrolled : ""}`}
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
  const guide = useOptionalGuide();
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
        <div className={`${s.stat} ${s.statNavo}`}>
          <span className={s.statNumber}>{d.byNavo}</span>
          <span className={p.rowNote}>By Navo and teams</span>
        </div>
        <div className={s.stat}>
          <span className={s.statNumber}>{d.byYou}</span>
          <span className={p.rowNote}>By you</span>
        </div>
      </div>
      <div className={s.checkIn}>
        <span className={s.itemTitle}>I&apos;ve prepared your check-in</span>
        {d.checkIn && (
          <span className={s.checkInItem}>
            <span className={s.checkMark}>✓</span>Booked with {manager} · {d.checkIn}
          </span>
        )}
        <span className={s.checkInItem}>
          <span className={s.checkMark}>✓</span>Your first-month summary, from the numbers above
        </span>
      </div>
      <div className={`${p.panel} ${s.pulsePanel}`}>
        <span className={s.itemTitle}>{picked ? "Thanks for telling me." : "How has joining felt?"}</span>
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
      {guide && (
        <button className={p.dark} onClick={() => guide.setOverlay("outro")}>
          See the impact →
        </button>
      )}
    </div>
  );
}
