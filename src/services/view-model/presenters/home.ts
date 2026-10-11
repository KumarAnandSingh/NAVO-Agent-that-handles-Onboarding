/** The joiner's home screen: headline, what Navo did, what needs them, what it is watching. */
import { COMPANY } from "@/content/company";
import { isAtRisk } from "@/domain/risk-engine";
import { atIst, calendarDaysUntil, dateKeyOf, formatRelative, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import type { Chapter, DidVM, FaceState, HomeVM, NeedVM, Tone } from "../types";
import type { Ctx} from "./context";
import { FULL_WEEKDAY, PHASE_TONE, done, riskActive, riskCaseResolved, lateBy, activityTime } from "./context";

export function presentHome(ctx: Ctx, chapter: Chapter): HomeVM {
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

export function greetingPart(now: Date): string {
  const hour = Number(formatTime(now).slice(0, 2));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function presentNeeds(ctx: Ctx, chapter: Chapter): NeedVM[] {
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

export function presentWatch(ctx: Ctx): HomeVM["watch"] {
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

export function whySteps(ctx: Ctx): HomeVM["whySteps"] {
  return ctx.state.activities
    .filter((a) => a.caseKey === "empid")
    .slice(-5)
    .map((a) => ({ phase: a.phase, text: a.summary, time: activityTime(a, ctx.now), tone: PHASE_TONE[a.phase] }));
}
