"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewModel } from "@/services/view-model/types";
import { HomeLink } from "@/ui/components/HomeLink";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo, type Screen } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import p from "./phone.module.css";
import { ClarifyScreen, DocumentsScreen, FormsScreen } from "./screens/Documents";
import { ConfirmScreen, DayOneDoneScreen, DayOneScreen, IdCardScreen, PickupScreen } from "./screens/DayOne";
import { HomeScreen } from "./screens/Home";
import { BenefitsScreen, CultureScreen, DayThirtyScreen, WeekOneScreen } from "./screens/Later";
import { LaunchScreen, MeetScreen, PrivacyScreen, SignInScreen } from "./screens/Onboarding";
import { IdTrackerScreen, JourneyScreen, UpdatesScreen } from "./screens/Tracking";

const NAVY: ReadonlySet<Screen> = new Set(["launch", "culture"]);

function renderScreen(screen: Screen, vm: ViewModel): ReactNode {
  switch (screen) {
    case "launch":
      return <LaunchScreen />;
    case "signin":
      return <SignInScreen />;
    case "meet":
      return <MeetScreen />;
    case "docs":
      return <DocumentsScreen vm={vm} />;
    case "privacy":
      return <PrivacyScreen vm={vm} />;
    case "clarify":
      return <ClarifyScreen vm={vm} />;
    case "forms":
      return <FormsScreen vm={vm} />;
    case "home":
      return <HomeScreen vm={vm} />;
    case "culture":
      return <CultureScreen />;
    case "idtrack":
      return <IdTrackerScreen vm={vm} />;
    case "journey":
      return <JourneyScreen vm={vm} />;
    case "updates":
      return <UpdatesScreen vm={vm} />;
    case "idcard":
      return <IdCardScreen vm={vm} />;
    case "pickup":
      return <PickupScreen vm={vm} />;
    case "day1":
      return <DayOneScreen vm={vm} />;
    case "confirm":
      return <ConfirmScreen vm={vm} />;
    case "day1done":
      return <DayOneDoneScreen vm={vm} />;
    case "week1":
      return <WeekOneScreen vm={vm} />;
    case "benefits":
      return <BenefitsScreen vm={vm} />;
    case "day30":
      return <DayThirtyScreen vm={vm} />;
  }
}

/** The joiner's phone: status bar, the current screen, toasts and the two bottom sheets. */
export function Phone({ fullscreen = false }: { fullscreen?: boolean }) {
  const { vm, screen, toast, error } = useNavo();
  const frame = [p.frame, NAVY.has(screen) ? p.frameNavy : screen === "home" ? p.frameHome : "", fullscreen ? p.fullscreen : ""].join(" ");
  return (
    <section className={frame} aria-label="Anand's phone">
      <div className={p.statusBar}>
        {vm?.clock.time ?? ""}
        {/* On its own page; on the demo stage the presenter panel has Home. */}
        {fullscreen && <HomeLink className={p.home} />}
      </div>
      {vm ? (
        <>
          {/* Keyed by screen so each one mounts fresh, like navigating in the app. */}
          <Fragment key={screen}>{renderScreen(screen, vm)}</Fragment>
          {toast && (
            <div className={p.toast} role="status">
              <NavoFace state="calm" size={22} decorative />
              <span>{toast}</span>
            </div>
          )}
          {error && (
            <div className={`${p.toast} ${p.toastError}`} role="alert">
              <span>{error}</span>
            </div>
          )}
          <ActivitySheet vm={vm} />
          <AskSheet />
        </>
      ) : (
        <div className={p.loading}>
          <NavoFace state="thinking" size={64} />
        </div>
      )}
    </section>
  );
}

function Sheet({ open, label, title, onClose, children, footer }: { open: boolean; label: string; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className={`${p.scrim} ${open ? "" : p.scrimHidden}`} onClick={onClose} aria-hidden />
      <div className={`${p.sheet} ${open ? "" : p.sheetClosed}`} role="dialog" aria-label={label} aria-modal={open} aria-hidden={!open} inert={!open}>
        <div className={p.sheetHeader}>
          <span className={p.sheetTitle}>{title}</span>
          <button className={p.sheetDone} onClick={onClose}>
            Done
          </button>
        </div>
        <div className={p.sheetBody}>{children}</div>
        {footer}
      </div>
    </>
  );
}

function ActivitySheet({ vm }: { vm: ViewModel }) {
  const { sheet, setSheet, liveFace } = useNavo();
  return (
    <Sheet
      open={sheet === "activity"}
      label="What Navo did"
      onClose={() => setSheet(null)}
      title={
        <>
          <NavoFace state={liveFace} size={24} decorative />
          What Navo did
        </>
      }
    >
      {vm.activity.length === 0 && <span className={p.muted}>Nothing yet. Every action Navo takes shows up here, with the reason.</span>}
      {vm.activity.map((c) => (
        <div key={c.key} className={p.case}>
          <div className={p.caseHead}>
            <span className={p.caseTitle}>{c.title}</span>
            <span className={`${p.pill} ${p.caseStatus}`} style={{ color: TONE[c.tone].ink, background: c.tone === "risk" ? "#FCEBDD" : c.tone === "wait" ? "#FBF1D9" : TONE[c.tone].bg }}>
              {c.status}
            </span>
          </div>
          <ol className={p.events}>
            {c.events.map((e, i) => (
              <li key={i} className={p.event}>
                <span className={p.eventTime}>{e.time}</span>
                <span className={p.eventRail}>
                  <span className={p.eventDot} style={{ background: TONE[e.tone].dot }} />
                  <span className={p.eventLine} />
                </span>
                <span className={p.eventBody}>
                  <span className={p.eventPhase} style={{ color: TONE[e.tone].ink }}>{e.phase}</span>
                  <span className={p.eventText}>{e.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Sheet>
  );
}

export const ASK_CHIPS = ["What if HR doesn't respond?", "What should I bring Monday?", "Can I add my parents to insurance?", "अगर HR जवाब न दे तो क्या होगा?"];

function AskSheet() {
  const { sheet, setSheet, messages, ask } = useNavo();
  const [question, setQuestion] = useState("");
  const thread = useRef<HTMLDivElement>(null);
  const open = sheet === "ask";
  useEffect(() => {
    // Scroll the sheet body only; scrollIntoView would also scroll the phone frame.
    const body = thread.current?.parentElement;
    if (open && body) body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [messages, open]);
  const send = (q: string) => {
    if (!q.trim()) return;
    setQuestion("");
    void ask(q);
  };
  return (
    <Sheet
      open={open}
      label="Ask Navo"
      onClose={() => setSheet(null)}
      title="Ask Navo"
      footer={
        <div className={p.askFooter}>
          <div className={p.askChips}>
            {ASK_CHIPS.map((chip) => (
              <button key={chip} className={p.askChip} onClick={() => send(chip)}>
                {chip}
              </button>
            ))}
          </div>
          <form
            className={p.askForm}
            onSubmit={(e) => {
              e.preventDefault();
              send(question);
            }}
          >
            <input
              className={p.askInput}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type a question"
              aria-label="Question for Navo"
              maxLength={500}
            />
            <button type="submit" className={p.askSend}>
              Ask
            </button>
          </form>
        </div>
      }
    >
      {messages.length === 0 && (
        <>
          <NavoFace state="calm" size={44} />
          <span className={p.askIntro}>I know your onboarding state, your calendar and Halden&apos;s policies. Ask about anything coming up.</span>
        </>
      )}
      <div ref={thread} aria-live="polite" className={p.thread}>
        {messages.map((m) =>
          m.role === "user" ? (
            <span key={m.id} className={p.question}>
              {m.text}
            </span>
          ) : (
            <div key={m.id} className={p.answer}>
              {m.checked && m.checked.length > 0 && <span className={p.answerChecked}>Checked {m.checked.join(" · ")}</span>}
              <span className={`${p.answerText} ${m.pending ? p.answerPending : ""}`}>{m.text}</span>
              {m.answeredBy && <span className={p.answeredBy}>{m.answeredBy}</span>}
              {m.actions?.map((a) => (
                <button key={a.label} className={p.answerAction} onClick={() => setSheet(a.run)}>
                  {a.label}
                </button>
              ))}
            </div>
          ),
        )}
      </div>
    </Sheet>
  );
}
