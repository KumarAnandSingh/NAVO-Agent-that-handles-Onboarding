"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FaceState, ToolCallVM, ViewModel } from "@/services/view-model/types";

export type Screen =
  | "launch"
  | "signin"
  | "meet"
  | "docs"
  | "privacy"
  | "clarify"
  | "forms"
  | "home"
  | "culture"
  | "idtrack"
  | "journey"
  | "updates"
  | "idcard"
  | "pickup"
  | "day1"
  | "confirm"
  | "day1done"
  | "week1"
  | "benefits"
  | "day30";

export type Sheet = "activity" | "ask" | null;
export type View = "emp" | "hr";

/** Human wording for what Navo is doing while a tool runs. */
export const TOOL_HUMAN: Record<string, string> = {
  get_employee_context: "Reading your profile",
  get_onboarding_state: "Checking your onboarding",
  get_dependencies: "Tracing dependencies",
  calculate_day1_risk: "Checking Day 1 risk",
  check_permission: "Checking permissions",
  search_policies: "Checking policy",
  check_sla: "Checking response time",
  send_reminder: "Following up with HR",
  escalate_owner: "Escalating",
  create_hr_request: "Raising HR request",
  create_it_request: "Raising IT request",
  schedule_meeting: "Booking your calendar",
  schedule_pickup: "Booking your pickup",
  enrol_training: "Enrolling you",
  update_task: "Updating state",
  notify_employee: "Writing your update",
  notify_owner: "Telling the team",
  request_approval: "Asking you",
  on_event: "Reading update",
  on_approval: "Reading your approval",
};

const THINKING = new Set(["get_employee_context", "get_onboarding_state", "get_dependencies", "calculate_day1_risk", "check_permission", "search_policies", "check_sla"]);

export function faceForTool(tool: string): FaceState {
  if (tool === "request_approval") return "needs";
  return THINKING.has(tool) ? "thinking" : "acting";
}

export interface ChatMessage {
  id: number;
  role: "user" | "navo";
  text: string;
  pending?: boolean;
  checked?: string[];
  composedBy?: "claude" | "fallback";
  actions?: { label: string; run: "activity" }[];
}

interface Replay {
  tools: ToolCallVM[];
  index: number;
}

interface NavoStore {
  vm: ViewModel | null;
  error: string | null;
  busy: boolean;
  replay: Replay | null;
  /** Face shown in the app header: follows the tool Navo is running during a replay. */
  liveFace: FaceState;
  liveStatus: { text: string; working: boolean } | null;
  screen: Screen;
  sheet: Sheet;
  view: View;
  why: boolean;
  toast: string | null;
  messages: ChatMessage[];
  go: (screen: Screen) => void;
  setSheet: (sheet: Sheet) => void;
  setView: (view: View) => void;
  toggleWhy: () => void;
  say: (text: string) => void;
  demo: (body: Record<string, unknown>) => Promise<ViewModel | null>;
  employee: (body: Record<string, unknown>, toast?: ToastFor) => Promise<ViewModel | null>;
  hr: (body: Record<string, unknown>) => Promise<ViewModel | null>;
  ask: (question: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Context = createContext<NavoStore | null>(null);

export const REPLAY_STEP_MS = 600;

async function post(url: string, body: unknown): Promise<{ vm: ViewModel }> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await response.json()) as { vm?: ViewModel; error?: string };
  if (!response.ok || !json.vm) throw new Error(json.error ?? `Request failed (${response.status})`);
  return { vm: json.vm };
}

/** Replay at most this many of the newest runs, so a long skip doesn't replay every quiet check. */
const REPLAY_RUNS = 2;

/** Tool calls in `next` that weren't in `previous`, oldest first. */
function newToolCalls(previous: ViewModel | null, next: ViewModel): ToolCallVM[] {
  if (!previous) return [];
  const seen = new Set(previous.runtime.runs.flatMap((r) => r.tools.map((t) => t.id)));
  const lastSeenRun = previous.runtime.latestRunId ?? 0;
  return next.runtime.runs
    .filter((run) => run.id > lastSeenRun)
    .slice(0, REPLAY_RUNS)
    .reverse()
    .flatMap((run) => run.tools.filter((t) => !seen.has(t.id)));
}

type ToastFor = string | ((vm: ViewModel) => string | null);

/** Where the joiner's app opens when it isn't driven by the presenter. */
export function screenForChapter(chapter: ViewModel["chapter"]): Screen {
  switch (chapter) {
    case "launch":
    case "documents":
      return "docs";
    case "day1":
      return "day1";
    case "week1":
      return "week1";
    default:
      return "home";
  }
}

export function NavoProvider({ children, initialScreen = "launch", pollMs }: { children: ReactNode; initialScreen?: Screen | "auto"; pollMs?: number }) {
  const [vm, setVm] = useState<ViewModel | null>(null);
  const [pendingVm, setPendingVm] = useState<ViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [screen, setScreen] = useState<Screen>(initialScreen === "auto" ? "home" : initialScreen);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [view, setView] = useState<View>("emp");
  const [why, setWhy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const vmRef = useRef<ViewModel | null>(null);
  vmRef.current = pendingVm ?? vm;

  const say = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /** Show a new view model, replaying Navo's new tool calls first so judges can follow them. */
  const apply = useCallback((next: ViewModel) => {
    const calls = newToolCalls(vmRef.current, next);
    if (calls.length === 0) {
      setVm(next);
      setPendingVm(null);
      return;
    }
    setPendingVm(next);
    setReplay({ tools: calls, index: 0 });
  }, []);

  useEffect(() => {
    if (!replay) return;
    const timer = setTimeout(() => {
      if (replay.index + 1 < replay.tools.length) {
        setReplay({ ...replay, index: replay.index + 1 });
      } else {
        setReplay(null);
        setVm((current) => pendingVm ?? current);
        setPendingVm(null);
      }
    }, REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [replay, pendingVm]);

  const run = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const { vm: next } = await post(url, body);
        apply(next);
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const json = (await response.json()) as { vm?: ViewModel; error?: string };
      if (json.vm) {
        if (vmRef.current === null) {
          setVm(json.vm);
          if (initialScreen === "auto") setScreen(screenForChapter(json.vm.chapter));
        } else apply(json.vm);
      } else setError(json.error ?? "Could not load");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apply, initialScreen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollMs) return;
    const timer = setInterval(() => {
      if (!busy && !replay) void refresh();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, busy, replay, refresh]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    const id = Date.now();
    setSheet("ask");
    setMessages((m) => [...m, { id: id - 1, role: "user", text: q }, { id, role: "navo", text: "Checking your state and policy…", pending: true }]);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      const json = (await response.json()) as {
        answer?: { text: string; checked: string[]; composedBy: "claude" | "fallback"; showActivity: boolean };
        vm?: ViewModel;
        error?: string;
      };
      if (!response.ok || !json.answer) throw new Error(json.error ?? "No answer");
      const answer = json.answer;
      // The runtime panel replays the tools Navo used to answer.
      if (json.vm) apply(json.vm);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id
            ? { id, role: "navo", text: answer.text, checked: answer.checked, composedBy: answer.composedBy, actions: answer.showActivity ? [{ label: "Show me", run: "activity" }] : undefined }
            : msg,
        ),
      );
    } catch (e) {
      setMessages((m) => m.map((msg) => (msg.id === id ? { id, role: "navo", text: e instanceof Error ? e.message : "Something went wrong." } : msg)));
    }
  }, [apply]);

  const currentTool = replay ? replay.tools[replay.index] : undefined;
  const value = useMemo<NavoStore>(
    () => ({
      vm,
      error,
      busy,
      replay,
      liveFace: currentTool ? faceForTool(currentTool.fn) : (vm?.home.face ?? "watching"),
      liveStatus: currentTool ? { text: `Navo is working · ${(TOOL_HUMAN[currentTool.fn] ?? currentTool.fn).toLowerCase()}…`, working: true } : null,
      screen,
      sheet,
      view,
      why,
      toast,
      messages,
      go: (s) => {
        setScreen(s);
        setSheet(null);
        setWhy(false);
        setView("emp");
      },
      setSheet,
      setView: (v) => {
        setView(v);
        setSheet(null);
      },
      toggleWhy: () => setWhy((w) => !w),
      say,
      demo: (body) => run("/api/demo", body),
      employee: async (body, toastFor) => {
        const next = await run("/api/employee", body);
        const text = next && toastFor ? (typeof toastFor === "string" ? toastFor : toastFor(next)) : null;
        if (text) say(text);
        return next;
      },
      hr: (body) => run("/api/hr", body),
      ask,
      refresh,
    }),
    [vm, error, busy, replay, currentTool, screen, sheet, view, why, toast, messages, say, run, ask, refresh],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavo(): NavoStore {
  const store = useContext(Context);
  if (!store) throw new Error("useNavo must be used inside NavoProvider");
  return store;
}
