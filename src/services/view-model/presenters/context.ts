/** What every presenter shares: the loaded state, the featured joiner and small helpers. */
import { isAtRisk } from "@/domain/risk-engine";
import { calendarDaysUntil, dateKeyOf, formatTime, weekdayName } from "@/domain/time";
import type { ActivityPhase } from "@/domain/types";
import type { LoadedState } from "../load";
import type { Chapter, Tone } from "../types";

export type TaskRow = LoadedState["tasks"][number];
export type ActivityRow = LoadedState["activities"][number];

export const FULL_WEEKDAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
export const PHASE_TONE: Record<ActivityPhase, Tone> = {
  Noticed: "muted",
  Decided: "calm",
  Acted: "agent",
  Reported: "done",
  Asked: "you",
  Planned: "muted",
  Resolved: "done",
};
export const CASE_TITLE: Record<string, string> = { empid: "Employee ID delay", setup: "Day 1 setup", docs: "Documents", benefits: "Benefits", week1: "First weeks" };
export interface Ctx {
  state: LoadedState;
  now: Date;
  employee: LoadedState["employees"][number];
  name: string;
  tasks: TaskRow[];
  byKey: Map<string, TaskRow>;
  day1Start: Date;
  pendingApproval: LoadedState["approvals"][number] | null;
}

export const done = (task: TaskRow | undefined) => task?.status === "completed";

export function chapterOf(ctx: Ctx): Chapter {
  const { now, day1Start } = ctx;
  if (!done(ctx.byKey.get("forms"))) return "documents";
  if (now.getTime() < day1Start.getTime()) return done(ctx.byKey.get("pickup")) ? "ready" : "pre_joining";
  if (dateKeyOf(now) === dateKeyOf(day1Start)) return "day1";
  return "week1";
}

export function riskActive(ctx: Ctx): boolean {
  return isAtRisk(ctx.employee.day1Risk) || ctx.pendingApproval !== null;
}

export function riskCaseResolved(ctx: Ctx): boolean {
  const empid = ctx.byKey.get("employee_id");
  return done(empid) && ctx.state.followUps.some((f) => f.employeeId === ctx.employee.personId && f.taskId === empid?.id);
}

export function lateBy(due: Date, now: Date): string {
  const days = Math.max(1, calendarDaysUntil(due, now));
  return days === 1 ? "1 day" : `${days} days`;
}
export function activityTime(a: ActivityRow, now: Date): string {
  return dateKeyOf(a.at) === dateKeyOf(now) ? formatTime(a.at) : `${weekdayName(a.at)} ${formatTime(a.at)}`;
}
