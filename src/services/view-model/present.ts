/**
 * Pure presenter: database state in, view model out. No I/O, so every screen's copy and
 * counts can be unit tested against a fixture state.
 */
import { COMPANY } from "@/content/company";
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import { TIMELINE } from "@/content/timeline";
import { isAtRisk } from "@/domain/risk-engine";
import { findFreeSlot } from "@/domain/scheduling";
import {
  addCalendarDays,
  atIst,
  calendarDaysUntil,
  dateKeyOf,
  formatDay,
  formatDayClock,
  formatLongDate,
  formatRelative,
  formatShortDate,
  formatTime,
  weekdayName,
} from "@/domain/time";
import type { ActivityPhase } from "@/domain/types";
import { displayDate, verifyRelievingLetter } from "@/services/documents/verify";
import type { LoadedState } from "./load";
import type {
  ActivityCaseVM,
  Chapter,
  Day1VM,
  DidVM,
  DocumentsVM,
  FaceState,
  FormsVM,
  HomeVM,
  HrVM,
  IdTrackerVM,
  ImpactVM,
  JourneyStepVM,
  NeedVM,
  RuntimeVM,
  Tone,
  UpdateVM,
  ViewModel,
  Week1VM,
} from "./types";

type TaskRow = LoadedState["tasks"][number];
type ActivityRow = LoadedState["activities"][number];

const FULL_WEEKDAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const PHASE_TONE: Record<ActivityPhase, Tone> = {
  Noticed: "muted",
  Decided: "calm",
  Acted: "agent",
  Reported: "done",
  Asked: "you",
  Planned: "muted",
  Resolved: "done",
};
const CASE_TITLE: Record<string, string> = { empid: "Employee ID delay", setup: "Day 1 setup", docs: "Documents", benefits: "Benefits", week1: "First weeks" };

export interface PresentOptions {
  liveAI: boolean;
  model: string | null;
}

export function present(state: LoadedState, options: PresentOptions): ViewModel {
  const now = state.workspace.simNow;
  const employee = state.employees.find((e) => e.personId === state.employeeId);
  if (!employee) throw new Error("Featured employee missing");
  const person = state.people.get(employee.personId);
  const name = person?.name ?? employee.personId;
  const tasks = state.tasks.filter((t) => t.employeeId === employee.personId);
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const day1Start = atIst(employee.joiningDate, "09:00");
  const pendingApproval = state.approvals.find((a) => a.employeeId === employee.personId && a.status === "pending" && a.requestedFrom === employee.personId) ?? null;
  const ctx: Ctx = { state, now, employee, name, tasks, byKey, day1Start, pendingApproval };
  const chapter = chapterOf(ctx);

  return {
    workspace: { id: state.workspace.id, scenario: state.workspace.scenario, itDelay: state.workspace.flags.itDelay === true },
    clock: { iso: now.toISOString(), time: formatTime(now), day: formatDay(now), dayClock: formatDayClock(now) },
    chapter,
    employee: {
      id: employee.personId,
      name,
      firstName: name.split(" ")[0] ?? name,
      initials: name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2),
      role: employee.role,
      day1: formatDay(day1Start),
      day1Long: formatLongDate(day1Start),
      daysToDay1: Math.max(0, calendarDaysUntil(now, day1Start)),
      employeeNumber: employee.employeeNumber,
      managerName: state.people.get(employee.managerId)?.name ?? "",
      buddyName: employee.buddyId ? (state.people.get(employee.buddyId)?.name ?? "") : "",
      hrName: state.people.get(employee.hrOwnerId)?.name ?? "",
    },
    home: presentHome(ctx, chapter),
    documents: presentDocuments(ctx),
    forms: presentForms(ctx),
    idTracker: presentIdTracker(ctx),
    journey: presentJourney(ctx, chapter),
    activity: presentActivity(ctx),
    day1: presentDay1(ctx),
    week1: presentWeek1(ctx),
    day30: presentDay30(ctx),
    updates: presentUpdates(ctx),
    impact: presentImpact(ctx),
    hr: presentHr(ctx),
    runtime: presentRuntime(ctx, options),
    pendingApproval: pendingApproval ? { id: pendingApproval.id, title: pendingApproval.title, detail: pendingApproval.detail } : null,
  };
}

interface Ctx {
  state: LoadedState;
  now: Date;
  employee: LoadedState["employees"][number];
  name: string;
  tasks: TaskRow[];
  byKey: Map<string, TaskRow>;
  day1Start: Date;
  pendingApproval: LoadedState["approvals"][number] | null;
}

const done = (task: TaskRow | undefined) => task?.status === "completed";

function chapterOf(ctx: Ctx): Chapter {
  const { now, day1Start } = ctx;
  if (!done(ctx.byKey.get("forms"))) return "documents";
  if (now.getTime() < day1Start.getTime()) return done(ctx.byKey.get("pickup")) ? "ready" : "pre_joining";
  if (dateKeyOf(now) === dateKeyOf(day1Start)) return "day1";
  return "week1";
}

function riskActive(ctx: Ctx): boolean {
  return isAtRisk(ctx.employee.day1Risk) || ctx.pendingApproval !== null;
}

function riskCaseResolved(ctx: Ctx): boolean {
  const empid = ctx.byKey.get("employee_id");
  return done(empid) && ctx.state.followUps.some((f) => f.employeeId === ctx.employee.personId && f.taskId === empid?.id);
}

function lateBy(due: Date, now: Date): string {
  const days = Math.max(1, calendarDaysUntil(due, now));
  return days === 1 ? "1 day" : `${days} days`;
}

/* ---------------- Home ---------------- */

function presentHome(ctx: Ctx, chapter: Chapter): HomeVM {
  const { tasks, now } = ctx;
  const watched = tasks.filter((t) => t.watched);
  const openWatched = watched.filter((t) => t.status !== "completed");
  const ready = done(ctx.byKey.get("pickup"));
  const needs = presentNeeds(ctx, chapter);
  const risk = riskActive(ctx);
  const loanerApproved = ctx.state.tickets.some((t) => t.type === "loaner");
  const day1Day = FULL_WEEKDAY[weekdayName(ctx.day1Start)] ?? "Day 1";

  let headline = `You join ${COMPANY.name} in ${Math.max(0, calendarDaysUntil(now, ctx.day1Start))} days. I've handled most of it.`;
  if (ctx.pendingApproval) headline = "I need one decision from you.";
  else if (isAtRisk(ctx.employee.day1Risk) && !loanerApproved) headline = `One risk to ${day1Day}. I'm on it.`;
  else if (loanerApproved && !done(ctx.byKey.get("employee_id"))) headline = "Day 1 is covered.";
  else if (ready) headline = `You're ready for ${day1Day}.`;
  else if (riskCaseResolved(ctx)) headline = `Blocker cleared. You're on track for ${day1Day}.`;

  let face: FaceState = "watching";
  if (ctx.pendingApproval) face = "needs";
  else if (isAtRisk(ctx.employee.day1Risk)) face = "concerned";
  else if (ready) face = "celebrating";
  else if (riskCaseResolved(ctx)) face = "calm";

  const status = ctx.pendingApproval
    ? { text: "Navo needs your input", tone: "you" as Tone }
    : isAtRisk(ctx.employee.day1Risk)
      ? { text: "Navo is handling this", tone: "risk" as Tone }
      : openWatched.length === 0
        ? { text: "All caught up", tone: "done" as Tone }
        : { text: `Watching ${watched.length} items`, tone: "done" as Tone };

  const latestRunId = ctx.state.runs[0]?.id ?? null;
  const headlines = ctx.state.activities.filter((a) => a.headline).sort((a, b) => b.at.getTime() - a.at.getTime() || b.id - a.id);
  const did: DidVM[] = headlines.slice(0, 3).map((a) => ({
    id: a.id,
    title: a.headline ?? a.summary,
    result: a.headlineDetail ?? "",
    when: a.runId !== null && a.runId === latestRunId ? "Just now" : formatRelative(a.at, now, true),
    fresh: a.runId !== null && a.runId === latestRunId,
    icon: a.action === "escalate_owner" ? "escalated" : a.action === "send_reminder" ? "navo" : "done",
  }));
  let didHead = "Navo handled this";
  if (risk) didHead = "Navo is handling this";
  else if (!did.some((d) => d.fresh) && headlines[0]) {
    const lastDay = dateKeyOf(headlines[0].at);
    const count = headlines.filter((h) => dateKeyOf(h.at) === lastDay).length;
    const dayDiff = calendarDaysUntil(headlines[0].at, now);
    didHead = dayDiff === 1 ? `Navo handled ${count} things overnight` : dayDiff > 1 ? `Since ${weekdayName(headlines[0].at)}` : "Navo handled this";
  }

  const docsDone = done(ctx.byKey.get("documents")) && done(ctx.byKey.get("forms"));
  return {
    greeting: `Good ${greetingPart(now)}, ${ctx.name.split(" ")[0]}.`,
    headline,
    status,
    face,
    budget: {
      needYou: needs.length,
      handling: openWatched.length,
      waiting: openWatched.filter((t) => t.status === "waiting" || t.status === "blocked").length,
      atRisk: watched.filter((t) => isAtRisk(t.riskLevel)).length,
    },
    needs,
    didHead,
    did,
    watch: presentWatch(ctx),
    whySteps: whySteps(ctx),
    readyForDay1: ready && now.getTime() < atIst(ctx.employee.joiningDate, "18:00").getTime(),
    docsLink: docsDone ? { label: "All verified", tone: "done" } : { label: "Action needed", tone: "you" },
    watchedCount: watched.length,
  };
}

function greetingPart(now: Date): string {
  const hour = Number(formatTime(now).slice(0, 2));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function presentNeeds(ctx: Ctx, chapter: Chapter): NeedVM[] {
  const needs: NeedVM[] = [];
  if (ctx.pendingApproval) {
    needs.push({ id: ctx.pendingApproval.id, kind: "approval", kicker: "Navo needs your input", title: ctx.pendingApproval.title, meta: ctx.pendingApproval.detail, approvalId: ctx.pendingApproval.id });
  }
  const scope: Record<Chapter, string[]> = {
    launch: ["documents", "pre_joining"],
    documents: ["documents", "pre_joining"],
    pre_joining: ["documents", "pre_joining"],
    ready: ["documents", "pre_joining"],
    day1: ["pre_joining", "day1"],
    week1: ["week1"],
  };
  for (const task of ctx.tasks) {
    if (task.ownerType !== "employee" || task.status !== "needs_user" || !scope[chapter].includes(task.phase)) continue;
    if (task.key === "security_training") {
      const due = task.dueAt ? FULL_WEEKDAY[weekdayName(task.dueAt)] : "soon";
      needs.push({ id: task.id, kind: "training", kicker: "Only you", title: "Security training", meta: `15 min · due ${due}` });
    } else if (task.key === "forms") {
      needs.push({ id: task.id, kind: "forms", kicker: "Only you", title: "Confirm your details", meta: "Pre-filled · 1 field needs you" });
    } else if (task.key === "day1_collect") {
      needs.push({ id: task.id, kind: "pickup", kicker: "Only you", title: "Collect ID card, laptop and kit", meta: `11:15 · ${COMPANY.pickupSite}` });
    } else if (task.key === "benefits_enrolment") {
      needs.push({ id: task.id, kind: "benefits", kicker: "Relevant now", title: "Health cover enrolment", meta: task.statusNote ?? "" });
    } else if (task.key === "documents") {
      needs.push({ id: task.id, kind: "documents", kicker: "Only you", title: "Documents", meta: task.statusNote ?? "" });
    }
  }
  return needs;
}

function presentWatch(ctx: Ctx): HomeVM["watch"] {
  const { byKey, now } = ctx;
  const empid = byKey.get("employee_id");
  const followUps = ctx.state.followUps.filter((f) => f.employeeId === ctx.employee.personId);
  const escalation = followUps.find((f) => f.kind === "escalation");
  const loaner = ctx.state.tickets.some((t) => t.type === "loaner");
  if (riskActive(ctx)) {
    const dayOne = ctx.tasks.filter((t) => t.requiredForDay1 && t.status !== "completed");
    const driver = dayOne.find((t) => t.key === "laptop" && isAtRisk(t.riskLevel)) ?? dayOne.find((t) => isAtRisk(t.riskLevel)) ?? byKey.get("laptop");
    const critical = driver?.riskLevel === "critical";
    let body = `${driver?.name ?? "Something"} depends on items that are late. I'm on it.`;
    if (escalation) {
      body = `HR hasn't replied in 24 hours. I escalated to ${ctx.state.people.get("neha.kapoor")?.name ?? "HR Ops"}, HR Ops lead${loaner ? ", and your loaner covers the laptop" : ""}.`;
    } else if (loaner && empid && !done(empid)) {
      body = "Your loaner covers the laptop. Your ID card still needs the Employee ID, so I'm chasing HR.";
    } else if (empid && !done(empid) && empid.dueAt) {
      body = `Your Employee ID is ${lateBy(empid.dueAt, now)} late, and the laptop needs 2 working days after it. I followed up with HR.`;
    }
    return {
      tone: "risk",
      kicker: critical ? "At risk" : "Watching a dependency",
      title: `${driver?.name ?? "Day 1"} ${critical ? "will miss" : "may miss"} Day 1`,
      body,
      foot: ctx.pendingApproval ? "The loaner needs your OK" : "You don't need to do anything",
      footTone: ctx.pendingApproval ? "you" : "done",
      face: "concerned",
    };
  }
  if (done(byKey.get("pickup"))) return null;
  const order = ["employee_id", "laptop", "vpn", "email", "background_check"];
  for (const key of order) {
    const task = byKey.get(key);
    if (!task || done(task)) continue;
    if (key === "employee_id" && (task.status === "blocked" || task.status === "pending")) {
      return { tone: "calm", kicker: "Watching", title: "Employee ID", body: "HR starts on it once your documents are verified.", foot: "You don't need to do anything", footTone: "done", face: "watching" };
    }
    if (key === "employee_id" && task.dueAt) {
      const late = task.dueAt.getTime() < now.getTime();
      return {
        tone: "calm",
        kicker: "Watching",
        title: "Employee ID",
        body: late ? `Due ${formatShortDate(task.dueAt)} from HR and now ${lateBy(task.dueAt, now)} late. The laptop still has slack; I'll act tomorrow morning if it's still missing.` : `Due ${formatShortDate(task.dueAt)} from HR. I'm keeping an eye on it.`,
        foot: "You don't need to do anything",
        footTone: "done",
        face: "watching",
      };
    }
    const laptop = byKey.get("laptop");
    const body =
      key === "vpn"
        ? `Set up once your laptop arrives${laptop?.statusNote ? ` (${laptop.statusNote.toLowerCase()})` : ""}.`
        : key === "laptop"
          ? `${task.statusNote ?? "With IT"}. I'll tell you when it's ready.`
          : `${task.statusNote ?? "In progress"}.`;
    return { tone: "calm", kicker: "Watching", title: key === "vpn" ? "VPN access" : task.name, body, foot: "You don't need to do anything", footTone: "done", face: "watching" };
  }
  return null;
}

function whySteps(ctx: Ctx): HomeVM["whySteps"] {
  return ctx.state.activities
    .filter((a) => a.caseKey === "empid")
    .slice(-5)
    .map((a) => ({ phase: a.phase, text: a.summary, time: activityTime(a, ctx.now), tone: PHASE_TONE[a.phase] }));
}

function activityTime(a: ActivityRow, now: Date): string {
  return dateKeyOf(a.at) === dateKeyOf(now) ? formatTime(a.at) : `${weekdayName(a.at)} ${formatTime(a.at)}`;
}

/* ---------------- Documents and forms ---------------- */

function presentDocuments(ctx: Ctx): DocumentsVM {
  const docs = ctx.state.documents;
  const stateOf = (status: string): { state: DocumentsVM["items"][number]["state"]; tone: Tone } => {
    switch (status) {
      case "verified":
        return { state: "Verified", tone: "done" };
      case "under_review":
        return { state: "Under review", tone: "wait" };
      case "clarify":
        return { state: "Clarify", tone: "wait" };
      case "rejected":
        return { state: "Re-upload", tone: "you" };
      default:
        return { state: "Needed", tone: "you" };
    }
  };
  const items = docs.map((d) => ({ type: d.type, name: d.name, note: d.note, ...stateOf(d.status), tappable: d.status === "clarify", readBy: d.readBy }));
  const address = docs.find((d) => d.type === "address_proof");
  const relieving = docs.find((d) => d.type === "relieving_letter");
  const allVerified = docs.every((d) => d.status === "verified" || d.status === "under_review");
  const formsDone = done(ctx.byKey.get("forms"));

  let clarify: DocumentsVM["clarify"] = null;
  if (relieving?.status === "clarify") {
    const verdict = verifyRelievingLetter(relieving.extracted, { notBefore: TIMELINE.offerAccepted, before: ctx.employee.joiningDate });
    if (verdict.status === "clarify") {
      clarify = {
        field: verdict.field,
        raw: verdict.raw,
        suggestion: verdict.suggestion,
        suggestionLabel: verdict.suggestion ? displayDate(verdict.suggestion) : null,
        documentName: relieving.name,
      };
    }
  }

  let view: Pick<DocumentsVM, "kicker" | "kickerTone" | "face" | "head" | "sub" | "cta">;
  if (address && (address.status === "needed" || address.status === "rejected")) {
    view =
      address.status === "rejected"
        ? { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "That bill isn't in your name.", sub: `${address.note.replace(" · re-upload", "")}. Upload one in your name and I'll finish today.`, cta: { label: "Upload another copy", action: "upload_address" } }
        : { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "Your address proof is missing.", sub: "Upload it and I can finish verification today. I've read everything else.", cta: { label: "Upload address proof", action: "upload_address" } };
  } else if (clarify) {
    view = { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "One thing to clarify.", sub: "I couldn't read one date on your relieving letter.", cta: { label: "Clarify relieving letter", action: "clarify" } };
  } else {
    view = {
      kicker: "ALL VERIFIED",
      kickerTone: "done",
      face: "celebrating",
      head: "All documents verified.",
      sub: "HR has everything they need. Degree check is with the vendor.",
      cta: formsDone ? { label: "Back to home", action: "home" } : { label: "Continue to forms", action: "forms" },
    };
  }
  return {
    ...view,
    items,
    allVerified,
    clarify,
    samples: SAMPLE_DOCUMENTS.filter((s) => s.documentType === "address_proof").map((s) => ({ id: s.id, label: s.label, documentType: s.documentType, file: s.file })),
  };
}

function presentForms(ctx: Ctx): FormsVM {
  const rows = ctx.state.formFields.map((f) => {
    const needsYou = f.status === "needs_employee" || !f.value;
    return {
      label: f.label,
      value: f.value ?? "Not provided",
      source: needsYou && f.status === "needs_employee" ? "Needs you" : f.source,
      tone: (needsYou ? "you" : f.status === "provided" ? "done" : "agent") as Tone,
      needsYou,
    };
  });
  const missing = rows.filter((r) => r.needsYou).length;
  return {
    sub: missing ? `Check them. Only ${missing} field${missing === 1 ? "" : "s"} need${missing === 1 ? "s" : ""} you.` : "All set. Check and submit.",
    rows,
    missing,
    submitted: done(ctx.byKey.get("forms")),
  };
}

/* ---------------- Employee ID tracker ---------------- */

function presentIdTracker(ctx: Ctx): IdTrackerVM {
  const empid = ctx.byKey.get("employee_id");
  const issued = done(empid);
  const followUps = ctx.state.followUps.filter((f) => f.taskId === empid?.id);
  const reminder = followUps.find((f) => f.kind === "reminder");
  const escalation = followUps.find((f) => f.kind === "escalation");
  const statusOf = (key: string) => {
    const task = ctx.byKey.get(key);
    if (!task) return "";
    if (task.status === "completed") return task.statusNote ?? "Done";
    return task.statusNote ?? task.blockedReason ?? "Waiting";
  };
  const deps = [
    { name: "ID card", owner: "HR", status: statusOf("id_card") },
    { name: "Laptop", owner: "IT", status: statusOf("laptop") },
    { name: "Email", owner: "IT", status: statusOf("email") },
    { name: "VPN, tools", owner: "IT", status: statusOf("vpn") },
  ];
  const bars = ["Requested", "Processing", "Generated", "Available"].map((label, i) => ({
    label,
    tone: (issued || i === 0 ? "done" : i === 1 ? "wait" : "muted") as Tone,
    current: !issued && i === 1,
  }));
  const base = { bars, deps };
  if (issued) {
    return {
      ...base,
      face: "celebrating",
      kicker: "RESOLVED",
      tone: "done",
      head: `Your Employee ID is ${ctx.employee.employeeNumber ?? "issued"}.`,
      sub: "Laptop, email and VPN requests went out right after.",
      impact: "None",
      next: statusOf("laptop") ? `Laptop: ${statusOf("laptop")}` : "Nothing pending",
      foot: "Back on track for Monday.",
      footTone: "done",
    };
  }
  const due = empid?.dueAt;
  if (escalation) {
    return {
      ...base,
      face: "concerned",
      kicker: "ESCALATED",
      tone: "risk",
      head: "Your Employee ID hasn't been generated yet.",
      sub: "HR didn't reply within 24 hours, so I escalated to the HR Ops lead.",
      impact: "High · escalated to HR Ops",
      next: ctx.pendingApproval ? "Loaner laptop needs your OK" : "HR Ops is generating it",
      foot: ctx.pendingApproval ? "One decision needed on Home." : "You don't need to do anything.",
      footTone: ctx.pendingApproval ? "you" : "done",
    };
  }
  if (reminder) {
    return {
      ...base,
      face: "concerned",
      kicker: "POTENTIAL DELAY DETECTED",
      tone: "risk",
      head: "Your Employee ID hasn't been generated yet.",
      sub: "Your ID card, laptop and access depend on it. I've already followed up with HR.",
      impact: ctx.employee.day1Risk === "critical" ? "Critical · laptop can't make Day 1" : "High · no working days of slack",
      next: ctx.pendingApproval ? "Loaner laptop needs your OK" : `Escalate ${formatDayClock(reminder.slaDueAt)} if no reply`,
      foot: ctx.pendingApproval ? "One decision needed on Home." : "You don't need to do anything.",
      footTone: ctx.pendingApproval ? "you" : "done",
    };
  }
  const late = due ? due.getTime() < ctx.now.getTime() : false;
  return {
    ...base,
    face: "watching",
    kicker: "WATCHING",
    tone: late ? "wait" : "muted",
    head: late ? `Your Employee ID is ${lateBy(due as Date, ctx.now)} late.` : "Your Employee ID is being processed.",
    sub: due ? (late ? "The laptop still has slack. I'll act tomorrow morning if it's still missing." : `Due ${formatShortDate(due)} from HR. I'm keeping an eye on it.`) : "HR starts once your documents are verified.",
    impact: late ? "Low · slack shrinking" : "None yet",
    next: "I'll check again at 09:15",
    foot: "You don't need to do anything.",
    footTone: "done",
  };
}

/* ---------------- Journey and activity ---------------- */

function presentJourney(ctx: Ctx, chapter: Chapter): JourneyStepVM[] {
  const needs = ctx.tasks.filter((t) => t.ownerType === "employee" && t.status === "needs_user" && (t.phase === "pre_joining" || t.phase === "documents")).length;
  const handling = ctx.tasks.filter((t) => t.watched && t.status !== "completed").length;
  const nowIndex = chapter === "day1" ? 5 : chapter === "week1" ? 6 : 4;
  const fmt = (key: string) => formatShortDate(atIst(key, "12:00"));
  const steps: [string, string, string][] = [
    ["Application", fmt(TIMELINE.application), `Applied for ${ctx.employee.role}`],
    ["Assessment", fmt(TIMELINE.assessment), "AI assessment completed"],
    ["Interview", fmt(TIMELINE.interview), `Panel with ${ctx.state.people.get(ctx.employee.managerId)?.name ?? "the hiring manager"}`],
    ["Offer", fmt(TIMELINE.offerSigned), `Accepted ${fmt(TIMELINE.offerAccepted)}`],
    ["Pre-joining", nowIndex === 4 ? "Now" : `To ${fmt(TIMELINE.trainingDue)}`, `${needs} need you · Navo handling ${handling}`],
    ["Day 1", formatDay(ctx.day1Start), "Induction, pickup, 1:1, buddy"],
    ["First week", `${fmt(addCalendarDays(TIMELINE.day1, 1)).split(" ")[0]}–${fmt(TIMELINE.week1End)}`, "Trainings, access, first project"],
    ["First 90 days", `To ${fmt(TIMELINE.first90End)}`, "Goals, check-ins, feedback"],
  ];
  return steps.map(([name, when, sub], i) => ({ name, when, sub, state: i < nowIndex ? "done" : i === nowIndex ? "now" : "upcoming" }));
}

function presentActivity(ctx: Ctx): ActivityCaseVM[] {
  const visible = ctx.state.activities.filter((a) => a.userVisible);
  const keys = [...new Set([...visible].reverse().map((a) => a.caseKey))];
  // While the Employee ID case is open it stays on top, whatever happened more recently.
  if (riskActive(ctx) && keys.includes("empid")) keys.sort((a, b) => Number(b === "empid") - Number(a === "empid"));
  const empid = ctx.byKey.get("employee_id");
  return keys.map((key) => {
    const events = visible.filter((a) => a.caseKey === key);
    let status = "Done";
    let tone: Tone = "done";
    if (key === "empid") {
      if (done(empid)) {
        status = "Resolved";
      } else if (riskActive(ctx)) {
        status = "At risk";
        tone = "risk";
      } else {
        status = "Watching";
        tone = "wait";
      }
    }
    return {
      key,
      title: CASE_TITLE[key] ?? key,
      status,
      tone,
      events: events.map((a) => ({ time: activityTime(a, ctx.now), phase: a.phase, text: a.summary, tone: PHASE_TONE[a.phase] })),
    };
  });
}

/* ---------------- Day 1, Week 1, Day 30 ---------------- */

function presentDay1(ctx: Ctx): Day1VM {
  const dayKey = ctx.employee.joiningDate;
  const events = ctx.state.calendar.filter((e) => dateKeyOf(e.startsAt) === dayKey);
  const loaner = ctx.state.tickets.some((t) => t.type === "loaner");
  const toneFor = (kind: string): Day1VM["schedule"][number]["tone"] =>
    kind === "pickup" ? "it" : kind === "one_on_one" ? "manager" : kind === "buddy" ? "buddy" : "hr";
  const whoFor: Record<string, string> = { it: "HR · IT", manager: "MANAGER", buddy: "BUDDY", hr: "HR", you: "YOU" };
  const schedule = events.map((e) => {
    const tone = toneFor(e.kind);
    return {
      time: formatTime(e.startsAt),
      what: e.kind === "one_on_one" ? `Meet ${ctx.state.people.get(e.withPersonId ?? "")?.name.split(" ")[0] ?? "your manager"}, your manager` : e.title,
      where: e.location,
      who: whoFor[tone] ?? "",
      tone,
      current: ctx.now.getTime() >= e.startsAt.getTime() && ctx.now.getTime() < e.endsAt.getTime(),
    };
  });
  const pickupTask = ctx.byKey.get("pickup");
  const itemState = (key: string, ready: string) => {
    const task = ctx.byKey.get(key);
    return { status: done(task) ? ready : (task?.statusNote ?? "Pending"), ready: done(task) };
  };
  const laptopName = loaner ? "Loaner laptop" : "Laptop";
  const empid = ctx.byKey.get("employee_id");
  const idCardTask = ctx.byKey.get("id_card");
  const site = COMPANY.pickupSite.split(" · ").pop() ?? COMPANY.pickupSite;

  const collectTask = ctx.byKey.get("day1_collect");
  const collectedKeys = new Set((collectTask?.evidence ?? []).filter((e) => e.startsWith("collected:")).map((e) => e.slice("collected:".length)));
  const wrapUp: Day1VM["wrapUp"] = done(collectTask)
    ? [
        { name: "ID card collected", key: "id" },
        { name: `${laptopName}, email and VPN`, key: "laptop" },
        { name: "Onboarding kit", key: "kit" },
      ].map(({ name, key }) =>
        collectedKeys.has(key) ? { name, status: "✓ Done", tone: "done" as Tone } : { name, status: "Navo arranging a new pickup", tone: "agent" as Tone },
      )
    : [];
  const meetings = ["day1_manager", "day1_buddy"].map((k) => ctx.byKey.get(k));
  if (done(collectTask)) {
    const met = meetings.every(done);
    wrapUp.splice(2, 0, { name: `Met ${ctx.state.people.get(ctx.employee.managerId)?.name.split(" ")[0] ?? "your manager"} and ${ctx.employee.buddyId ? (ctx.state.people.get(ctx.employee.buddyId)?.name.split(" ")[0] ?? "your buddy") : "your buddy"}`, status: met ? "✓ Done" : "Booked for today", tone: met ? "done" : "muted" });
  }
  const nextDay = ctx.state.calendar.find((e) => dateKeyOf(e.startsAt) > dayKey && e.kind === "product_induction");
  const toolAccess = ctx.byKey.get("tool_access");

  return {
    schedule,
    pickup: done(pickupTask)
      ? {
          site: COMPANY.pickupSite,
          window: `${weekdayName(ctx.day1Start)} ${formatShortDate(ctx.day1Start)} · 11:15 – 11:45`,
          items: [
            { key: "id", name: "Employee ID card", owner: "HR", ...itemState("id_card", "Ready") },
            { key: "laptop", name: laptopName, owner: "IT", ...itemState("laptop", loaner ? "Loaner ready" : "Ready") },
            { key: "kit", name: "Onboarding kit", owner: "FACILITIES", ...itemState("onboarding_kit", "Ready") },
          ],
        }
      : null,
    idCard: {
      number: ctx.employee.employeeNumber,
      readyNote: pickupTask?.completedAt ? `Navo · ${weekdayName(pickupTask.completedAt)} ${formatShortDate(pickupTask.completedAt)}, ${formatTime(pickupTask.completedAt)}` : null,
      generated: empid?.completedAt ? formatShortDate(empid.completedAt) : null,
      ready: idCardTask?.completedAt ? formatShortDate(idCardTask.completedAt) : null,
      collect: `Day 1, 11:15 · ${site}`,
    },
    collected: done(collectTask),
    wrapUp,
    tomorrow: nextDay
      ? `${nextDay.title} at ${formatTime(nextDay.startsAt)}.${toolAccess && toolAccess.status !== "pending" && toolAccess.status !== "blocked" ? " I've requested your Jira and Figma access." : ""}`
      : null,
    loaner,
    travelTip: `${COMPANY.office.split(",").slice(0, 2).join(",")} is about 40 min from ${ctx.employee.homeArea ?? "home"}. Leave by 8:30.`,
  };
}

function presentWeek1(ctx: Ctx): Week1VM {
  const rows: [string, string, string][] = [
    ["product_induction", "Product induction", "Tue"],
    ["mandatory_training", "Mandatory training", "Tue"],
    ["access_activation", "Email and VPN access", "Mon"],
    ["team_intros", "Team introductions", "Wed"],
    ["tool_access", "First project setup", "Thu"],
    ["feedback_checkin", "Feedback check-in with Rahul", "Fri"],
  ];
  const items = rows.map(([key, name, day]) => {
    const task = ctx.byKey.get(key);
    const isDone = done(task);
    return { name, day, done: isDone, sub: isDone ? "" : key === "tool_access" ? "Navo requesting Jira and Figma access" : (task?.statusNote ?? "") };
  });
  const benefitsTask = ctx.byKey.get("benefits_enrolment");
  const family = ctx.employee.family;
  const children = family?.children ?? 0;
  const childLabel = children === 1 ? "1 child" : `${children} children`;
  const covered = ["You", family?.maritalStatus === "married" ? "spouse" : null, children ? childLabel : null].filter(Boolean).join(", ");
  const familyNote =
    family?.maritalStatus === "married"
      ? `You told me you're married${children ? ` with ${children === 1 ? "one child" : `${children} children`}` : ""}. Here's what applies to you.`
      : "Here's what applies to you.";
  const firstName = (id: string | null) => (id ? (ctx.state.people.get(id)?.name.split(" ")[0] ?? null) : null);
  const buddy = firstName(ctx.employee.buddyId) ?? "your buddy";
  const manager = firstName(ctx.employee.managerId) ?? "your manager";
  const walkthrough = ctx.state.calendar.find((e) => e.kind === "walkthrough");
  let suggestion: Week1VM["suggestion"] = null;
  if (walkthrough) {
    suggestion = { booked: true, text: `Booked: roadmap walkthrough with ${buddy}, ${formatDayClock(walkthrough.startsAt)}. Added to your calendar.` };
  } else if (ctx.now.getTime() >= ctx.day1Start.getTime()) {
    const slot = findFreeSlot(ctx.now, ctx.state.calendar);
    if (slot) {
      const when = dateKeyOf(slot.startsAt) === dateKeyOf(ctx.now) ? "today" : `on ${FULL_WEEKDAY[weekdayName(slot.startsAt)] ?? weekdayName(slot.startsAt)}`;
      suggestion = { booked: false, text: `You're free ${when} at ${formatTime(slot.startsAt)}. Want me to book a roadmap walkthrough with ${buddy} before your check-in with ${manager}?` };
    }
  }
  return {
    items,
    doneCount: items.filter((i) => i.done).length,
    suggestion,
    benefits: benefitsTask?.dueAt
      ? {
          open: benefitsTask.status === "needs_user",
          enrolled: done(benefitsTask),
          deadline: formatDay(benefitsTask.dueAt),
          daysLeft: Math.max(0, calendarDaysUntil(ctx.now, benefitsTask.dueAt)),
          covered,
          familyNote,
          // Figures from Benefits policy §3.2 (src/content/policies.ts).
          rows: [
            { label: covered, value: "Covered", tone: "calm" },
            { label: "Sum insured", value: "₹5,00,000", tone: "calm" },
            { label: "Add parents", value: "Optional · ₹1,200/mo", tone: "calm" },
            { label: "Deadline", value: formatDay(benefitsTask.dueAt), tone: "risk" },
          ],
          source: "From: Benefits policy §3.2 · Your family details",
        }
      : null,
  };
}

function presentDay30(ctx: Ctx) {
  const completed = ctx.tasks.filter((t) => t.status === "completed");
  const byYou = completed.filter((t) => t.ownerType === "employee").length;
  const checkIn = ctx.state.calendar.find((e) => e.kind === "check_in_30");
  return {
    tasksDone: completed.length,
    byNavo: completed.length - byYou,
    byYou,
    checkIn: checkIn ? `${weekdayName(checkIn.startsAt)} ${formatShortDate(checkIn.startsAt)}, ${formatTime(checkIn.startsAt)}` : "",
    next: `60-day goals review · ${formatShortDate(atIst(addCalendarDays(ctx.employee.joiningDate, 60), "12:00"))}`,
    pulse: ctx.state.pulse?.score ?? null,
    open: ctx.tasks.filter((t) => t.status !== "completed" && t.key !== "checkin_30").map((t) => t.name),
  };
}

function presentImpact(ctx: Ctx): ImpactVM {
  const completed = ctx.tasks.filter((t) => t.status === "completed");
  const byYou = completed.filter((t) => t.ownerType === "employee").length;
  const mine = ctx.state.followUps.filter((f) => f.employeeId === ctx.employee.personId);
  const firstReminder = [...mine].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())[0];
  return {
    tasksDone: completed.length,
    tasksTotal: ctx.tasks.length,
    byNavo: completed.length - byYou,
    byYou,
    riskCaughtDaysBefore: firstReminder ? calendarDaysUntil(firstReminder.sentAt, ctx.day1Start) : null,
    followUpsSent: mine.length,
    toolCalls: ctx.state.toolCallCount,
    askedFirst: ctx.state.approvals.filter((a) => a.employeeId === ctx.employee.personId && a.requestedFrom === ctx.employee.personId).length,
    joiners: ctx.state.employees.length,
  };
}

function presentUpdates(ctx: Ctx): UpdateVM[] {
  return ctx.state.notifications.map((n) => {
    const diff = calendarDaysUntil(n.at, ctx.now);
    return {
      id: n.id,
      group: diff === 0 ? "Today" : diff === 1 ? "Yesterday" : formatDay(n.at),
      title: n.title,
      body: n.body,
      time: formatTime(n.at),
      needsYou: n.kind === "needs_you",
      composedBy: n.composedBy,
    };
  });
}

/* ---------------- HR owner console ---------------- */

const OWNER_LABEL: Record<string, string> = { employee: "Joiner", hr: "HR", hr_ops: "HR", it: "IT", facilities: "Facilities", vendor: "Vendor", manager: "Manager", buddy: "Buddy", navo: "Navo" };

function presentHr(ctx: Ctx): HrVM {
  const { state } = ctx;
  const featuredId = ctx.employee.personId;
  const empid = ctx.byKey.get("employee_id");
  const followUps = state.followUps.filter((f) => f.employeeId === featuredId && f.taskId === empid?.id && f.status !== "resolved");
  const reminder = followUps.find((f) => f.kind === "reminder");
  const escalation = followUps.find((f) => f.kind === "escalation");
  const queue: HrVM["queue"] = [];
  if (empid && !done(empid) && (reminder || escalation)) {
    queue.push(
      escalation
        ? {
            id: escalation.id,
            initials: "AM",
            title: "Escalated: Employee ID 24h overdue",
            who: ctx.name,
            body: `starts ${formatDay(ctx.day1Start)}`,
            navo: `escalated to ${state.people.get("neha.kapoor")?.name ?? "HR Ops"}${ctx.pendingApproval ? ", loaner awaiting Anand's OK" : ""}`,
            cta: "Generate ID",
            action: "generate_id",
            highlight: "risk",
          }
        : {
            id: reminder!.id,
            initials: "AM",
            title: "Employee ID not generated",
            who: ctx.name,
            body: `${empid.dueAt ? lateBy(empid.dueAt, ctx.now) : "Overdue"} late, blocks laptop and access`,
            navo: `reminded you at ${formatTime(reminder!.sentAt)}, escalates in 24h`,
            cta: "Generate ID",
            action: "generate_id",
            highlight: "agent",
          },
    );
  }
  for (const approval of state.approvals.filter((a) => a.requestedFrom === "priya.nair" && a.status === "pending")) {
    const who = state.people.get(approval.employeeId)?.name ?? approval.employeeId;
    queue.push({
      id: approval.id,
      initials: who.split(" ").map((p) => p[0]).join(""),
      title: approval.title,
      who,
      body: approval.detail,
      navo: approval.reason,
      cta: approval.action === "review_document" ? "Review" : "Decide",
      action: "none",
      highlight: "none",
    });
  }

  const joiners = [...state.employees]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.joiningDate.localeCompare(b.joiningDate))
    .slice(0, 6)
    .map((e) => {
      const personName = state.people.get(e.personId)?.name ?? e.personId;
      const open = state.tasks.filter((t) => t.employeeId === e.personId && t.status !== "completed" && (t.phase === "pre_joining" || t.phase === "documents"));
      const counts = new Map<string, number>();
      for (const t of open) if (t.status !== "blocked") counts.set(OWNER_LABEL[t.ownerType] ?? t.ownerType, (counts.get(OWNER_LABEL[t.ownerType] ?? t.ownerType) ?? 0) + 1);
      const openText = [...counts.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") || "Nothing open";
      let status = "On track";
      let tone: Tone = "done";
      if (e.featured) {
        if (done(ctx.byKey.get("pickup"))) status = "Ready";
        else if (isAtRisk(e.day1Risk)) [status, tone] = ["At risk", "risk"];
        else if (e.day1Risk === "medium") [status, tone] = ["Watching", "wait"];
      } else if (state.approvals.some((a) => a.employeeId === e.personId && a.status === "pending" && a.action === "decide_start_date")) {
        [status, tone] = ["Needs HR", "risk"];
      } else if (state.approvals.some((a) => a.employeeId === e.personId && a.status === "pending")) {
        [status, tone] = ["Watching", "wait"];
      }
      return { name: personName, role: e.role, start: formatDay(atIst(e.joiningDate, "09:00")), open: openText, status, tone };
    });

  const featured = joiners[0];
  const resolvedByNavo = state.activities.filter((a) => a.phase === "Acted" && calendarDaysUntil(a.at, ctx.now) < 7).length;
  const note = done(empid)
    ? "Nothing. Navo raised IT requests the moment the ID was issued."
    : escalation
      ? `Escalated to HR Ops after 24h.${ctx.pendingApproval ? " Navo asked Anand to approve a loaner." : ""}`
      : reminder
        ? "Employee ID is overdue. Generating it unblocks laptop, email and VPN automatically."
        : `Nothing yet. Navo is tracking ${ctx.tasks.filter((t) => t.watched).length} items.`;
  return {
    headline: queue.length === 1 ? "1 thing needs you." : `${queue.length} things need you.`,
    counts: {
      joining: state.employees.length,
      onTrack: joiners.filter((j) => j.tone === "done").length + Math.max(0, state.employees.length - joiners.length),
      needHr: queue.length,
      resolvedByNavo,
    },
    queue,
    joiners,
    featured: {
      status: featured?.status ?? "",
      note,
      tone: featured?.tone ?? "muted",
      feed: [...state.activities]
        .reverse()
        .slice(0, 12)
        .map((a) => ({ time: activityTime(a, ctx.now), phase: a.phase.toUpperCase(), text: a.summary, tone: PHASE_TONE[a.phase] })),
    },
  };
}

/* ---------------- Agent runtime ---------------- */

function presentRuntime(ctx: Ctx, options: PresentOptions): RuntimeVM {
  const { state } = ctx;
  const runs = state.runs.map((run) => ({
    id: run.id,
    trigger: run.trigger,
    time: formatDayClock(run.startedAt),
    outcome: run.outcome,
    summary: run.summary,
    tools: state.toolCalls
      .filter((c) => c.runId === run.id)
      .map((c) => ({ id: c.id, runId: run.id, fn: c.tool, args: c.argsSummary, result: c.resultSummary, guard: c.guard, status: c.status, time: formatTime(c.at) })),
    diff: state.stateChanges
      .filter((s) => s.runId === run.id)
      .map((s) => (s.fromValue ? `${s.label}: ${s.fromValue} → ${s.toValue}` : `${s.label}: ${s.toValue}`)),
  }));
  return {
    runs,
    latestRunId: runs[0]?.id ?? null,
    upcoming: state.upcoming.map((e) => ({ label: e.label, when: formatDayClock(e.dueAt) })),
    liveAI: options.liveAI,
    model: options.model,
  };
}
