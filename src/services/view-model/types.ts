/**
 * The view model the UI renders. Built on the server from database state by a pure
 * presenter, serialised as JSON, and consumed by client components. Types only: this
 * file is safe to import from the browser.
 */

export type Tone = "done" | "agent" | "wait" | "risk" | "you" | "calm" | "muted";
export type FaceState = "brand" | "calm" | "watching" | "thinking" | "acting" | "waiting" | "concerned" | "needs" | "celebrating";
export type GuardVM = "read" | "policy" | "auto" | "approval" | "event" | "denied";

export interface ClockVM {
  iso: string;
  time: string;
  day: string;
  dayClock: string;
}

export interface NeedVM {
  id: string;
  kind: "training" | "approval" | "documents" | "forms" | "benefits" | "pickup";
  kicker: string;
  title: string;
  meta: string;
  approvalId?: string;
}

export interface DidVM {
  id: number;
  title: string;
  result: string;
  when: string;
  fresh: boolean;
  icon: "done" | "navo" | "escalated";
}

export interface WhyStepVM {
  phase: string;
  text: string;
  time: string;
  tone: Tone;
}

export interface WatchVM {
  tone: "risk" | "calm";
  kicker: string;
  title: string;
  body: string;
  foot: string;
  footTone: Tone;
  face: FaceState;
}

export interface HomeVM {
  greeting: string;
  headline: string;
  status: { text: string; tone: Tone };
  face: FaceState;
  budget: { needYou: number; handling: number; waiting: number; atRisk: number };
  needs: NeedVM[];
  didHead: string;
  did: DidVM[];
  watch: WatchVM | null;
  whySteps: WhyStepVM[];
  readyForDay1: boolean;
  docsLink: { label: string; tone: Tone };
  watchedCount: number;
}

export interface DocumentVM {
  type: string;
  name: string;
  note: string;
  state: "Verified" | "Under review" | "Clarify" | "Needed" | "Re-upload";
  tone: Tone;
  tappable: boolean;
  readBy: "claude" | "fixture" | "seed" | null;
}

export interface DocumentsVM {
  kicker: string;
  kickerTone: Tone;
  face: FaceState;
  head: string;
  sub: string;
  cta: { label: string; action: "upload_address" | "clarify" | "forms" | "home" };
  items: DocumentVM[];
  allVerified: boolean;
  clarify: { field: string; raw: string; suggestion: string | null; suggestionLabel: string | null; documentName: string } | null;
  samples: { id: string; label: string; documentType: string; file: string }[];
}

export interface FormRowVM {
  label: string;
  value: string;
  source: string;
  tone: Tone;
  needsYou: boolean;
}

export interface FormsVM {
  sub: string;
  rows: FormRowVM[];
  missing: number;
  submitted: boolean;
}

export interface IdTrackerVM {
  face: FaceState;
  kicker: string;
  tone: Tone;
  head: string;
  sub: string;
  bars: { label: string; tone: Tone; current: boolean }[];
  deps: { name: string; owner: string; status: string }[];
  impact: string;
  next: string;
  foot: string;
  footTone: Tone;
}

export interface JourneyStepVM {
  name: string;
  when: string;
  sub: string;
  state: "done" | "now" | "upcoming";
}

export interface ActivityCaseVM {
  key: string;
  title: string;
  status: string;
  tone: Tone;
  events: { time: string; phase: string; text: string; tone: Tone }[];
}

export interface ScheduleItemVM {
  time: string;
  what: string;
  where: string;
  who: string;
  tone: "hr" | "it" | "manager" | "buddy" | "you";
  current?: boolean;
}

export interface Day1VM {
  schedule: ScheduleItemVM[];
  pickup: { site: string; window: string; items: { key: "id" | "laptop" | "kit"; name: string; owner: string; status: string; ready: boolean }[] } | null;
  idCard: { number: string | null; readyNote: string | null; generated: string | null; ready: string | null; collect: string };
  collected: boolean;
  /** After the joiner confirms the pickup: what was closed and what Navo is still sorting. */
  wrapUp: { name: string; status: string; tone: Tone }[];
  tomorrow: string | null;
  loaner: boolean;
  travelTip: string;
}

export interface Week1VM {
  items: { name: string; day: string; done: boolean; sub: string }[];
  doneCount: number;
  /** Navo's suggestion of a walkthrough with the buddy, or the booking once made. */
  suggestion: { text: string; booked: boolean } | null;
  benefits: {
    open: boolean;
    enrolled: boolean;
    deadline: string;
    daysLeft: number;
    covered: string;
    familyNote: string;
    rows: { label: string; value: string; tone: Tone }[];
    source: string;
  } | null;
}

export interface Day30VM {
  tasksDone: number;
  byNavo: number;
  byYou: number;
  checkIn: string;
  next: string;
  pulse: number | null;
  /** Items still open at the 30-day mark, so the screen never claims "complete" falsely. */
  open: string[];
}

/** Figures for the impact screen, all computed from this workspace's run. */
export interface ImpactVM {
  tasksDone: number;
  tasksTotal: number;
  byNavo: number;
  byYou: number;
  /** Calendar days before Day 1 that Navo first acted on a Day-1 risk, if it did. */
  riskCaughtDaysBefore: number | null;
  followUpsSent: number;
  toolCalls: number;
  askedFirst: number;
  joiners: number;
}

export interface UpdateVM {
  id: number;
  group: string;
  title: string;
  body: string;
  time: string;
  needsYou: boolean;
  composedBy: "claude" | "template";
}

export interface ToolCallVM {
  id: number;
  runId: number;
  fn: string;
  args: string;
  result: string;
  guard: GuardVM;
  status: "ok" | "error" | "denied" | "timeout";
  time: string;
}

export interface RunVM {
  id: number;
  trigger: string;
  time: string;
  outcome: "acted" | "no_action" | "awaiting_approval" | "failed" | null;
  /** What the run concluded, in words. */
  summary: string | null;
  tools: ToolCallVM[];
  diff: string[];
}

export interface RuntimeVM {
  runs: RunVM[];
  latestRunId: number | null;
  upcoming: { label: string; when: string }[];
  ai: AiStatusVM;
}

/** How Navo reaches Claude for this visitor, which model does what, and what it has cost. */
export interface AiStatusVM {
  /** Offline (Navo's rules), the deployment's key, or the visitor's own key. */
  mode: "offline" | "server" | "visitor";
  /** Whether this deployment lets visitors connect their own Claude key. */
  byok: boolean;
  routes: { feature: string; label: string; models: string[]; effort: string; why: string }[];
  usage: {
    feature: string;
    label: string;
    model: string;
    calls: number;
    /** Attempts that failed or were declined (a fallback model or Navo's rules took over). */
    failed: number;
    avgLatencyMs: number | null;
    tokensIn: number;
    tokensOut: number;
    cachedTokens: number;
    costUsd: number | null;
  }[];
  /** Personal numbers masked before text was sent to Claude. */
  masked: number;
  totalCostUsd: number;
}

export interface HrQueueItemVM {
  id: string;
  initials: string;
  title: string;
  who: string;
  body: string;
  navo: string;
  cta: string;
  action: "generate_id" | "none";
  highlight: "risk" | "agent" | "none";
}

export interface HrVM {
  headline: string;
  counts: { joining: number; onTrack: number; needHr: number; resolvedByNavo: number };
  queue: HrQueueItemVM[];
  joiners: { name: string; role: string; start: string; open: string; status: string; tone: Tone }[];
  featured: { status: string; note: string; tone: Tone; feed: { time: string; phase: string; text: string; tone: Tone }[] };
  radar: RadarVM;
  policies: {
    items: PolicyItemVM[];
    /** The simulated date, the default effective date for a new policy. */
    today: string;
    /** Policies in force that HR can publish a newer version of. */
    replaceable: { family: string; title: string; version: string }[];
  };
}

/** The cohort radar: every joiner's Day-1 risk, under today's facts and each what-if. */
export interface RadarVM {
  scenarios: {
    id: string;
    label: string;
    summary: string;
    levels: { level: string; label: string; count: number; tone: Tone }[];
    bottlenecks: { team: string; joiners: number; worst: string; tone: Tone }[];
    joiners: { id: string; name: string; role: string; start: string; level: string; label: string; tone: Tone; driver: string; changed: boolean }[];
  }[];
}

export interface PolicyItemVM {
  documentId: string;
  family: string;
  title: string;
  version: string;
  effectiveDate: string;
  refs: string;
  sections: number;
  source: "library" | "hr";
  status: "in force" | "scheduled" | "superseded";
}

export type Chapter = "launch" | "documents" | "pre_joining" | "ready" | "day1" | "week1";

export interface ViewModel {
  workspace: { id: string; scenario: "hr_responds" | "hr_silent"; itDelay: boolean };
  clock: ClockVM;
  chapter: Chapter;
  employee: {
    id: string;
    name: string;
    firstName: string;
    initials: string;
    role: string;
    day1: string;
    day1Long: string;
    daysToDay1: number;
    employeeNumber: string | null;
    managerName: string;
    buddyName: string;
    hrName: string;
  };
  home: HomeVM;
  documents: DocumentsVM;
  forms: FormsVM;
  idTracker: IdTrackerVM;
  journey: JourneyStepVM[];
  activity: ActivityCaseVM[];
  day1: Day1VM;
  week1: Week1VM;
  day30: Day30VM;
  updates: UpdateVM[];
  impact: ImpactVM;
  hr: HrVM;
  runtime: RuntimeVM;
  pendingApproval: { id: string; title: string; detail: string } | null;
}
