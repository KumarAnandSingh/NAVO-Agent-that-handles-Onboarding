"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewModel } from "@/services/view-model/types";
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
      <div className={p.statusBar}>{vm?.clock.time ?? ""}</div>
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
            <div className={p.toast} role="alert" style={{ background: "var(--you)" }}>
              <span>{error}</span>
            </div>
          )}
          <ActivitySheet vm={vm} />
          <AskSheet />
        </>
      ) : (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <NavoFace state="thinking" size={64} />
        </div>
      )}
    </section>
  );
}

function Sheet({ open, label, title, onClose, children, footer }: { open: boolean; label: string; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className={p.scrim} style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }} onClick={onClose} aria-hidden />
      <div className={p.sheet} style={{ transform: `translateY(${open ? "0%" : "105%"})`, visibility: open ? "visible" : "hidden", transition: open ? undefined : "transform .38s cubic-bezier(.2,.8,.2,1), visibility 0s .38s" }} role="dialog" aria-label={label} aria-modal={open} aria-hidden={!open} inert={!open}>
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
        <div key={c.key} className={p.stack2} style={{ gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</span>
            <span className={p.pill} style={{ fontWeight: 400, fontSize: 12, color: TONE[c.tone].ink, background: c.tone === "risk" ? "#FCEBDD" : c.tone === "wait" ? "#FBF1D9" : TONE[c.tone].bg }}>
              {c.status}
            </span>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {c.events.map((e, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "64px 12px 1fr", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums", paddingTop: 1 }}>{e.time}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: TONE[e.tone].dot, marginTop: 5, flex: "none" }} />
                  <span style={{ flex: 1, width: 1, background: "#E2E6ED" }} />
                </span>
                <span className={p.stack2} style={{ paddingBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: TONE[e.tone].ink }}>{e.phase}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.4 }}>{e.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Sheet>
  );
}

export const ASK_CHIPS = ["What if HR doesn't respond?", "What should I bring Monday?", "Can I add my parents to insurance?"];

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
        <div style={{ flex: "none", padding: "10px 16px 26px", borderTop: "1px solid var(--line-3)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ASK_CHIPS.map((chip) => (
              <button key={chip} onClick={() => send(chip)} style={{ border: "1px solid #E2E6ED", background: "#fff", borderRadius: 999, padding: "6px 11px", fontSize: 12, color: "var(--ink)" }}>
                {chip}
              </button>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              send(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type a question"
              aria-label="Question for Navo"
              maxLength={500}
              style={{ flex: 1, border: "1px solid #E2E6ED", borderRadius: 22, padding: "11px 16px", fontSize: 14, outline: "none", color: "var(--ink)", minWidth: 0 }}
            />
            <button type="submit" style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 22, padding: "0 16px", fontSize: 14, fontWeight: 600 }}>
              Ask
            </button>
          </form>
        </div>
      }
    >
      {messages.length === 0 && (
        <>
          <NavoFace state="calm" size={44} />
          <span style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.5 }}>I know your onboarding state, your calendar and Halden&apos;s policies. Ask about anything coming up.</span>
        </>
      )}
      <div ref={thread} aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {messages.map((m) =>
          m.role === "user" ? (
            <span key={m.id} style={{ alignSelf: "flex-end", fontSize: 14, lineHeight: 1.5, maxWidth: "92%", background: "var(--surface-3)", borderRadius: 14, padding: "9px 13px" }}>
              {m.text}
            </span>
          ) : (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              {m.checked && m.checked.length > 0 && <span style={{ fontSize: 11, color: "var(--accent)" }}>Checked {m.checked.join(" · ")}</span>}
              <span style={{ fontSize: 14, lineHeight: 1.5, maxWidth: "92%", color: m.pending ? "var(--text-3)" : "var(--ink)", textWrap: "pretty" }}>{m.text}</span>
              {m.composedBy && <span style={{ fontSize: 10, color: "var(--text-4)" }}>{m.composedBy === "claude" ? "Answered by Claude with Navo's tools" : "Offline answer from Navo's rules"}</span>}
              {m.actions?.map((a) => (
                <button key={a.label} onClick={() => setSheet(a.run)} style={{ background: "var(--accent-soft-2)", color: "var(--accent)", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
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
