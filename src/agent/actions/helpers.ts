/** Wording and small helpers shared by the action handlers. */
import type { MeetingSlot } from "@/content/seed/onboarding-template";
import { addCalendarDays, atIst, calendarDaysUntil, dateKeyOf, formatTime, weekdayName } from "@/domain/time";
import { getTask, updateTask } from "@/services/onboarding-state/repository";
import type { AgentContext } from "../context";
import { TEMPLATES } from "../snapshot";

export const OWNER_TEAM: Record<string, string> = { hr: "HR", hr_ops: "HR Ops", it: "IT", facilities: "Facilities", vendor: "the vendor" };

export function slotTimes(joiningDate: string, slot: MeetingSlot): { startsAt: Date; endsAt: Date } {
  const day = addCalendarDays(joiningDate, slot.dayOffset);
  return { startsAt: atIst(day, slot.start), endsAt: atIst(day, slot.end) };
}

export function lateBy(dueAt: Date, now: Date): string {
  const days = Math.max(1, calendarDaysUntil(dueAt, now));
  return days === 1 ? "1 day" : `${days} days`;
}

/** "Today 12:00", "Fri 12:00". */
export function relativeDay(date: Date, now: Date): string {
  return dateKeyOf(date) === dateKeyOf(now) ? `Today ${formatTime(date)}` : `${weekdayName(date)} ${formatTime(date)}`;
}

/** Update the short status line on a task (cosmetic; not a state transition, so not a tool call). */
export async function setTaskNote(ctx: AgentContext, taskId: string, note: string): Promise<void> {
  const task = await getTask(ctx.db, ctx.workspace.id, taskId);
  if (task.statusNote !== note) await updateTask(ctx.db, task, { statusNote: note }, { actor: "navo", at: ctx.clock });
}
export function caseFor(key: string): string {
  if (["employee_id", "laptop", "email", "vpn", "id_card"].includes(key)) return "empid";
  if (["documents", "forms"].includes(key)) return "docs";
  if (key === "benefits_enrolment") return "benefits";
  return "setup";
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Lower-case a task name for use mid-sentence, keeping acronyms such as VPN or ID. */
export function displayName(name: string): string {
  return name
    .split(" ")
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

export function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** How long an employee task takes, from its template ("It takes 15 minutes."). */
export function effortOf(key: string): string {
  const fulfilment = TEMPLATES.get(key as never)?.fulfilment;
  return fulfilment?.kind === "training" ? `It takes ${fulfilment.minutes} minutes.` : "";
}

/** "Email and VPN access" → "email and VPN access", leaving acronyms alone. */
export function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
