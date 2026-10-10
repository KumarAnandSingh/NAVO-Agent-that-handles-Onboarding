/** The journey steps and Navo's activity log, grouped by case. */
import { TIMELINE } from "@/content/timeline";
import { addCalendarDays, atIst, formatDay, formatShortDate } from "@/domain/time";
import type { ActivityCaseVM, Chapter, JourneyStepVM, Tone } from "../types";
import type { Ctx} from "./context";
import { PHASE_TONE, CASE_TITLE, done, riskActive, activityTime } from "./context";

export function presentJourney(ctx: Ctx, chapter: Chapter): JourneyStepVM[] {
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

export function presentActivity(ctx: Ctx): ActivityCaseVM[] {
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
