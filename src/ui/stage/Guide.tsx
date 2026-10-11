"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavo } from "@/ui/state/NavoStore";
import { BEATS, BeatFailed, type GuideApi } from "./beats";
import st from "./guide.module.css";

type Overlay = "intro" | "outro" | null;

interface GuideState {
  /** The beat running or last run. */
  beat: number | null;
  /** The beat whose caption is on screen (updates once its action has finished). */
  shownBeat: number | null;
  total: number;
  auto: boolean;
  running: boolean;
  caption: string;
  overlay: Overlay;
  error: string | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  /** Start the guided demo at a chapter (0–5) and keep playing from there. */
  playChapter: (chapter: number) => void;
  /** Pause and go back to the home screen (the intro). */
  goHome: () => void;
  setOverlay: (overlay: Overlay) => void;
}

const Context = createContext<GuideState | null>(null);

/** Drives the guided demo: runs beats against the real API, paces them, and owns the shortcuts. */
export function GuideProvider({ children }: { children: ReactNode }) {
  const store = useNavo();
  const { busy, replay, go, setView, setSheet, setWhy, demo, employee, hr, latest } = store;
  const [beat, setBeat] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [running, setRunning] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("intro");
  const [error, setError] = useState<string | null>(null);
  // Captions describe the state a beat produced, so they're computed when its action finishes.
  const [shown, setShown] = useState<{ beat: number; caption: string } | null>(null);
  const runningRef = useRef(false);
  /** A chapter jump that failed, so Play and → try it again. */
  const retryChapter = useRef<number | null>(null);
  /** Whether Navo has finished: no request in flight and its tool calls done replaying. */
  const idle = useRef(true);
  useEffect(() => {
    idle.current = !busy && !replay;
  }, [busy, replay]);

  const api = useMemo<GuideApi>(
    () => ({ go, setView, setSheet, setWhy, demo, employee, hr, latest, openOutro: () => setOverlay("outro") }),
    [go, setView, setSheet, setWhy, demo, employee, hr, latest],
  );

  const run = useCallback(
    async (indices: number[], prepare?: () => Promise<boolean>) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setError(null);
      try {
        if (prepare && !(await prepare())) throw new BeatFailed("The demo action failed");
        for (const i of indices) {
          const target = BEATS[i];
          if (!target) break;
          setBeat(i);
          await target.run(api);
          setShown({ beat: i, caption: target.caption(latest()) });
        }
      } catch (e) {
        setAuto(false);
        setError(e instanceof BeatFailed ? e.message : "Something went wrong in the demo");
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [api, latest],
  );

  /** Restore a chapter's starting point on the engine, then auto-play from its first beat. */
  const playChapter = useCallback(
    (chapter: number) => {
      const start = BEATS.findIndex((b) => b.chapter === chapter);
      if (start < 0) return;
      setOverlay(null);
      setAuto(true);
      retryChapter.current = null;
      // The first beat resets the story itself; later chapters are replayed on the engine first.
      if (chapter === 0) return void run([start]);
      void run([start], async () => {
        setShown({ beat: start, caption: `Skipping ahead to chapter ${chapter + 1}…` });
        // The tour is told with HR responding, as its first beat sets it.
        const ready =
          (latest()?.workspace.scenario === "hr_responds" || Boolean(await demo({ action: "scenario", scenario: "hr_responds" }))) &&
          Boolean(await demo({ action: "chapter", chapter }));
        if (!ready) {
          // The replay may have reset the story already, so Play and → retry the jump, not the old beat.
          retryChapter.current = chapter;
          setBeat(null);
          return false;
        }
        // Keep "Skipping ahead" up until the phone shows the chapter's state.
        for (let waited = 0; !idle.current && waited < 20_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
        return true;
      });
    },
    [demo, latest, run],
  );

  const next = useCallback(() => {
    if (retryChapter.current !== null) return playChapter(retryChapter.current);
    const target = beat === null ? 0 : beat + 1;
    if (target >= BEATS.length) return setAuto(false);
    setOverlay(null);
    void run([target]);
  }, [beat, playChapter, run]);

  /** Back one beat: restore the chapter's starting point, then replay up to the beat before. */
  const prev = useCallback(() => {
    if (beat === null || beat <= 0) return;
    setAuto(false);
    const target = beat - 1;
    const chapter = BEATS[target]!.chapter;
    const start = BEATS.findIndex((b) => b.chapter === chapter);
    void (async () => {
      if (runningRef.current) return;
      if (chapter >= 1 && !(await demo({ action: "chapter", chapter }))) return;
      await run(Array.from({ length: target - start + 1 }, (_, k) => start + k));
    })();
  }, [beat, demo, run]);

  const play = useCallback(() => {
    if (retryChapter.current !== null) return playChapter(retryChapter.current);
    setOverlay(null);
    setAuto(true);
    if (beat === null || beat >= BEATS.length - 1) void run([0]);
  }, [beat, playChapter, run]);
  const pause = useCallback(() => setAuto(false), []);
  const goHome = useCallback(() => {
    setAuto(false);
    setOverlay("intro");
  }, []);
  const toggle = useCallback(() => (auto ? pause() : play()), [auto, pause, play]);

  // Auto-play: once a beat's action and Navo's tool replay have finished, dwell, then move on.
  useEffect(() => {
    if (!auto || running || busy || replay || beat === null || overlay) return;
    const current = BEATS[beat];
    if (!current || beat >= BEATS.length - 1) return;
    const timer = setTimeout(() => void run([beat + 1]), current.dwellMs);
    return () => clearTimeout(timer);
  }, [auto, running, busy, replay, beat, overlay, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === " ") {
        // Space on a focused button presses that button, as it should.
        if (target?.closest("button, a, select, [role='button'], [role='radio'], [role='tab']")) return;
        e.preventDefault();
        toggle();
      } else if (e.key === "h" || e.key === "H") {
        setView(store.view === "hr" ? "emp" : "hr");
      } else if (e.key === "b" || e.key === "B") {
        setOverlay((o) => (o === "intro" ? null : "intro"));
      } else if (e.key === "Escape") {
        setOverlay(null);
        setSheet(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, toggle, setView, setSheet, store.view]);

  const value: GuideState = {
    beat,
    shownBeat: shown?.beat ?? null,
    total: BEATS.length - 1,
    auto,
    running,
    caption: shown?.caption ?? "",
    overlay,
    error,
    play,
    pause,
    toggle,
    next,
    prev,
    playChapter,
    goHome,
    setOverlay,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The guide when the phone is on the demo stage; null on the standalone /phone page. */
export function useOptionalGuide(): GuideState | null {
  return useContext(Context);
}

export function useGuide(): GuideState {
  const guide = useContext(Context);
  if (!guide) throw new Error("useGuide must be used inside GuideProvider");
  return guide;
}

/** The caption bar along the bottom while the guided demo is running. */
export function CaptionBar() {
  const { shownBeat: beat, total, caption, auto, running, overlay, error, toggle, next, prev, goHome } = useGuide();
  if (beat === null || overlay || (!caption && !error)) return null;
  return (
    <div className={st.caption} role="region" aria-label="Guided demo">
      <div className={st.progress}>
        <div className={st.progressFill} style={{ width: `${Math.round((beat / total) * 100)}%` }} />
      </div>
      <div className={st.captionRow}>
        <span className={st.captionCount}>
          {beat + 1} / {total}
        </span>
        <span className={st.captionText} aria-live="polite">
          {error ?? caption}
        </span>
        <span className={st.captionButtons}>
          <button className={st.captionHome} onClick={goHome} title="Back to Home (B)">
            ⌂ Home
          </button>
          <button className={st.captionNav} onClick={prev} disabled={running || beat === 0} aria-label="Previous step">
            ←
          </button>
          <button className={st.captionPlay} onClick={toggle}>
            {auto ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button className={st.captionNav} onClick={next} disabled={running} aria-label="Next step">
            →
          </button>
        </span>
      </div>
    </div>
  );
}
