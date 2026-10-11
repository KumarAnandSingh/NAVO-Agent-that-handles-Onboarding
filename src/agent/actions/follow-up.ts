/** Chasing late work: reminders, escalation after the SLA, and proposing a loaner laptop. */
import { COMPANY } from "@/content/company";
import { formatDay, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import { expectedReadyAt } from "@/mock-systems/it";
import { enqueueEvent } from "@/services/events/queue";
import { listPeople } from "@/services/onboarding-state/repository";
import { narrate, recordActivity, tick, type AgentContext } from "../context";
import type { OnboardingSnapshot } from "../snapshot";
import { callTool } from "../tools/registry";
import { calculateDay1Risk, checkPermissionTool, checkSla, escalateOwner, notifyEmployee, requestApproval, searchPolicyLibrary, sendReminder } from "../tools";
import { OWNER_TEAM, lateBy, relativeDay, setTaskNote, caseFor, listText, displayName, capitalize } from "./helpers";

export async function remindOwner(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string, ownerId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const driver = snapshot.risk.driver;
  const driverTask = driver ? snapshot.tasks.find((t) => t.id === driver.taskId) : undefined;
  if (!task || !driverTask || !task.dueAt) return;
  const people = await listPeople(ctx.db, ctx.workspace.id);
  const owner = people.get(ownerId);
  const ownerName = owner?.name ?? ownerId;
  const team = OWNER_TEAM[task.ownerType] ?? task.ownerType;
  const watched = new Set(snapshot.tasks.filter((t) => t.watched).map((t) => t.id));
  const dependents = snapshot.graph
    .downstream(taskId)
    .filter((t) => t.requiredForDay1 && t.status !== "completed" && watched.has(t.id))
    .map((t) => displayName(t.name));
  const late = lateBy(task.dueAt, ctx.clock);
  ctx.acted = true;

  await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Noticed", summary: `${task.name} not issued. Due ${formatShortDate(task.dueAt)}, owner ${team}.`, taskId });
  if (dependents.length) {
    await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Noticed", summary: `${capitalize(listText(dependents))} depend on it.`, taskId });
  }
  tick(ctx);
  await callTool(ctx, calculateDay1Risk, { employeeId: ctx.employeeId });
  const safe = snapshot.risk.driverLastSafeStart;
  const decided = safe
    ? `${driverTask.name} needs ${task.name} + ${driverTask.leadWorkingDays} working days. ${relativeDay(safe, ctx.clock)} is the last safe start. Day 1 at risk.`
    : `${driverTask.name} depends on ${task.name}. Day 1 at risk.`;
  await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Decided", summary: decided, taskId });
  tick(ctx);
  await callTool(ctx, checkPermissionTool, { action: "send_reminder" });
  const message = `${task.name} for ${snapshot.employee.personId} was due ${formatShortDate(task.dueAt)}. ${capitalize(listText(dependents))} depend on it; Day 1 is ${formatDay(snapshot.day1Start)}.`;
  await callTool(ctx, sendReminder, { taskId, toPersonId: ownerId, message });
  await setTaskNote(ctx, taskId, `${team} · ${late} late`);
  await recordActivity(ctx, {
    caseKey: caseFor(task.key),
    phase: "Acted",
    summary: `Reminded ${ownerName}, ${team}. Allowed automatically (Section 4.1).`,
    taskId,
    action: "send_reminder",
    headline: `Followed up with ${team}`,
    headlineDetail: `${task.name} is ${late} late`,
  });
  const plan = ["No reply in 24h → escalate to HR Ops lead (Section 4.2)."];
  if (safe && safe.getTime() > ctx.clock.getTime()) {
    plan.push(`No ID by ${formatTime(safe)} → offer you a loaner laptop.`);
    await enqueueEvent(ctx.db, ctx.workspace.id, {
      type: "navo.deadline_check",
      source: "navo",
      label: `Navo re-checks at the last safe start (${formatTime(safe)})`,
      dueAt: safe,
      payload: { employeeId: ctx.employeeId, taskId: driverTask.id },
      idempotencyKey: `navo.deadline_check:${driverTask.id}:${safe.toISOString()}`,
    });
  }
  await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Planned", summary: plan.join(" "), taskId });
  const narration = await narrate(ctx, {
    kind: "risk_detected",
    facts: {
      blocker: task.name,
      lateBy: late,
      dependent: driverTask.name.toLowerCase(),
      leadTime: `${driverTask.leadWorkingDays} working days`,
      owner: team,
    },
  });
  await callTool(ctx, notifyEmployee, { title: `${driverTask.name} may miss Day 1`, body: narration.text, needsYou: false, composedBy: narration.composedBy });
}

export async function escalate(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string, followUpId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const reminder = snapshot.followUps.find((f) => f.id === followUpId);
  if (!task || !reminder) return;
  const people = await listPeople(ctx.db, ctx.workspace.id);
  const lead = people.get("neha.kapoor");
  const team = OWNER_TEAM[task.ownerType] ?? task.ownerType;
  ctx.acted = true;

  await callTool(ctx, checkSla, { followUpId });
  await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Noticed", summary: `No reply from ${team} in 24 hours.`, taskId });
  await callTool(ctx, calculateDay1Risk, { employeeId: ctx.employeeId });
  await callTool(ctx, searchPolicyLibrary, { query: "escalate unanswered reminder HR Operations lead" });
  const hours = (ctx.clock.getTime() - reminder.sentAt.getTime()) / 3_600_000;
  await callTool(ctx, checkPermissionTool, { action: "escalate_owner", hoursSinceReminder: hours });
  tick(ctx);
  await callTool(ctx, escalateOwner, {
    taskId,
    followUpId,
    toPersonId: "neha.kapoor",
    ccPersonId: reminder.toPersonId,
    message: `${task.name} for ${snapshot.employee.personId} is overdue and a reminder to ${reminder.toPersonId} went unanswered for 24 hours. Day 1 is ${formatDay(snapshot.day1Start)}.`,
  });
  await setTaskNote(ctx, taskId, "Escalated to HR Ops");
  await recordActivity(ctx, {
    caseKey: caseFor(task.key),
    phase: "Acted",
    summary: `Escalated to ${lead?.name ?? "the HR Ops lead"}, HR Ops lead. Allowed after 24h (Section 4.2).`,
    taskId,
    action: "escalate_owner",
    headline: "Escalated to HR Ops",
    headlineDetail: `No reply from ${team} in 24h`,
  });
  const loaner = snapshot.tickets.some((t) => t.type === "loaner");
  const narration = await narrate(ctx, {
    kind: "escalated",
    facts: {
      owner: team,
      escalatedTo: `${lead?.name ?? "the HR Ops lead"}, HR Ops lead`,
      backup: loaner ? "Your loaner laptop covers Day 1 either way." : "",
    },
  });
  await callTool(ctx, notifyEmployee, { title: "Escalated to HR Ops", body: narration.text, needsYou: false, composedBy: narration.composedBy });
}

export async function proposeLoaner(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return;
  ctx.acted = true;
  await recordActivity(ctx, { caseKey: "empid", phase: "Decided", summary: `${task.name} will miss Day 1 unless the Employee ID arrives today.`, taskId });
  await callTool(ctx, checkPermissionTool, { action: "request_loaner" });
  // Same ready time the IT system will commit to if Anand approves now.
  const readyAt = expectedReadyAt("loaner", ctx.clock, snapshot.day1Start);
  const site = COMPANY.pickupSite.split(" · ").pop() ?? COMPANY.pickupSite;
  const detail = `IT can have one ready at ${site} by ${weekdayName(readyAt)} ${formatTime(readyAt)}, in time for your Day 1 pickup. Your own laptop follows.`;
  await callTool(ctx, requestApproval, {
    action: "request_loaner",
    title: "Use a loaner laptop for Day 1?",
    detail,
    reason: "Asset change · needs your approval (Section 4.2)",
    payload: { taskId },
  });
  await recordActivity(ctx, { caseKey: "empid", phase: "Asked", summary: "Loaner laptop is an asset change. Asked Anand to approve.", taskId, action: "request_loaner" });
  const narration = await narrate(ctx, {
    kind: "needs_approval",
    facts: { question: "Use a loaner laptop for Day 1?", detail },
  });
  await callTool(ctx, notifyEmployee, { title: "Navo needs your input", body: narration.text, needsYou: true, composedBy: narration.composedBy });
}
