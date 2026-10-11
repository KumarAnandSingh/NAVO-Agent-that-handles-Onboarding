/** Booking the pickup and keeping the joiner informed: watching notes, nudges, what matters now. */
import { COMPANY } from "@/content/company";
import { atIst, calendarDaysUntil, formatDay, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import { narrate, recordActivity, type AgentContext } from "../context";
import { noteKey } from "../playbooks";
import type { OnboardingSnapshot } from "../snapshot";
import { callTool } from "../tools/registry";
import { notifyEmployee, schedulePickup, searchPolicyLibrary, updateTaskTool } from "../tools";
import { OWNER_TEAM, lateBy, setTaskNote, caseFor, listText, displayName, effortOf, lowerFirst } from "./helpers";

export async function bookPickup(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const startsAt = atIst(snapshot.employee.joiningDate, "11:15");
  const endsAt = atIst(snapshot.employee.joiningDate, "11:45");
  const loaner = snapshot.tickets.some((t) => t.type === "loaner");
  const items = ["ID card", loaner ? "loaner laptop" : "laptop", "onboarding kit"];
  await callTool(ctx, schedulePickup, { site: COMPANY.pickupSite, startsAt, endsAt, items, linkedTaskId: taskId });
  await callTool(ctx, updateTaskTool, { taskId, status: "completed", note: `${weekdayName(startsAt)} ${formatTime(startsAt)} · Building B`, reason: "Pickup booked" });
  await recordActivity(ctx, {
    caseKey: "setup",
    phase: "Acted",
    summary: `Booked one pickup for ID card, ${items[1]} and kit: ${weekdayName(startsAt)} ${formatTime(startsAt)}, ${COMPANY.pickupSite}.`,
    taskId,
    headline: "Day 1 pickup booked",
    headlineDetail: `${weekdayName(startsAt)} ${formatTime(startsAt)} · Building B`,
  });
  const narration = await narrate(ctx, {
    kind: "ready_for_day1",
    facts: { site: COMPANY.pickupSite, when: `${weekdayName(startsAt)} ${formatTime(startsAt)}` },
  });
  await callTool(ctx, notifyEmployee, { title: "Your Day 1 pickup is ready", body: narration.text, needsYou: false, composedBy: narration.composedBy });
}

export async function noteWatching(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const driver = snapshot.risk.driver;
  if (!task || !task.dueAt || !driver) return;
  const team = OWNER_TEAM[task.ownerType] ?? task.ownerType;
  const slack = driver.slackWorkingDays ?? 0;
  await setTaskNote(ctx, taskId, `${team} · ${lateBy(task.dueAt, ctx.clock)} late`);
  await recordActivity(ctx, {
    caseKey: caseFor(task.key),
    phase: "Noticed",
    summary: `${task.name} was due ${formatShortDate(task.dueAt)}. The laptop still has ${slack} working day${slack === 1 ? "" : "s"} of slack, so I'm watching and will check again tomorrow at 09:15.`,
    taskId,
    action: noteKey("watching", taskId),
  });
}

export async function nudgeEmployee(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return;
  ctx.acted = true;
  const waiting = snapshot.graph
    .directDependents(taskId)
    .filter((t) => t.status !== "completed")
    .map((t) => lowerFirst(displayName(t.name)));
  const holding = waiting.length ? `It's holding up your ${listText(waiting)}${snapshot.day1Passed ? "" : " for Day 1"}.` : "";
  await callTool(ctx, notifyEmployee, {
    title: `${task.name} is ${snapshot.day1Passed ? "overdue" : "due"}`,
    body: `${holding} ${effortOf(task.key)}`.trim(),
    needsYou: true,
    composedBy: "template",
  });
  await recordActivity(ctx, { caseKey: "setup", phase: "Asked", summary: `Reminded you about ${task.name.toLowerCase()}.`, taskId, action: noteKey("nudge", taskId) });
}

export async function openRelevant(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task || !task.dueAt) return;
  ctx.acted = true;
  const days = calendarDaysUntil(ctx.clock, task.dueAt);
  await callTool(ctx, searchPolicyLibrary, { query: "health cover spouse children parents enrol" });
  await callTool(ctx, updateTaskTool, { taskId, status: "needs_user", note: `Closes in ${days} days`, reason: "Relevant now" });
  const narration = await narrate(ctx, {
    kind: "relevant_now",
    facts: { headline: `Health cover enrolment closes in ${days} days.`, detail: "Your spouse and child are covered at no cost. Parents are optional." },
  });
  await callTool(ctx, notifyEmployee, { title: "Health cover enrolment", body: narration.text, needsYou: true, composedBy: narration.composedBy });
  await recordActivity(ctx, {
    caseKey: "benefits",
    phase: "Noticed",
    summary: `Health cover enrolment closes ${formatDay(task.dueAt)}. Matched Section 3.2 of the Benefits policy to your family details.`,
    taskId,
    headline: "Spotted a benefits deadline",
    headlineDetail: `Closes ${formatShortDate(task.dueAt)}`,
  });
}

/** Group activity into the cases the Activity sheet shows. */
