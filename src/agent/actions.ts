/**
 * How Navo carries out each planned action: which tools it calls, in what order, and the
 * product-level explanation it records (what changed, why, what it did, what's next).
 */
import { COMPANY } from "@/content/company";
import { TIMELINE } from "@/content/timeline";
import type { MeetingSlot } from "@/content/seed/onboarding-template";
import {
  addCalendarDays,
  atIst,
  addWorkingDays,
  calendarDaysUntil,
  dateKeyOf,
  formatDay,
  formatShortDate,
  formatTime,
  weekdayName,
} from "@/domain/time";
import { listEvents } from "@/mock-systems/calendar";
import { expectedReadyAt } from "@/mock-systems/it";
import { enqueueEvent } from "@/services/events/queue";
import { getTask, listPeople, updateTask } from "@/services/onboarding-state/repository";
import { narrate, recordActivity, tick, type AgentContext } from "./context";
import type { PlannedAction } from "./playbooks";
import { noteKey } from "./playbooks";
import { TEMPLATES, type OnboardingSnapshot } from "./snapshot";
import { callTool } from "./tools/registry";
import {
  calculateDay1Risk,
  checkPermissionTool,
  checkSla,
  createHrRequestTool,
  createItRequest,
  enrolTraining,
  escalateOwner,
  notifyEmployee,
  requestApproval,
  schedulePickup,
  scheduleMeeting,
  searchPolicyLibrary,
  sendReminder,
  updateTaskTool,
} from "./tools";

const OWNER_TEAM: Record<string, string> = { hr: "HR", hr_ops: "HR Ops", it: "IT", facilities: "Facilities", vendor: "the vendor" };

export function slotTimes(joiningDate: string, slot: MeetingSlot): { startsAt: Date; endsAt: Date } {
  const day = addCalendarDays(joiningDate, slot.dayOffset);
  return { startsAt: atIst(day, slot.start), endsAt: atIst(day, slot.end) };
}

function lateBy(dueAt: Date, now: Date): string {
  const days = Math.max(1, calendarDaysUntil(dueAt, now));
  return days === 1 ? "1 day" : `${days} days`;
}

/** "Today 12:00", "Fri 12:00". */
function relativeDay(date: Date, now: Date): string {
  return dateKeyOf(date) === dateKeyOf(now) ? `Today ${formatTime(date)}` : `${weekdayName(date)} ${formatTime(date)}`;
}

/** Update the short status line on a task (cosmetic; not a state transition, so not a tool call). */
async function setTaskNote(ctx: AgentContext, taskId: string, note: string): Promise<void> {
  const task = await getTask(ctx.db, ctx.workspace.id, taskId);
  if (task.statusNote !== note) await updateTask(ctx.db, task, { statusNote: note }, { actor: "navo", at: ctx.clock });
}

export async function executeAction(ctx: AgentContext, snapshot: OnboardingSnapshot, action: PlannedAction): Promise<void> {
  switch (action.kind) {
    case "start_task":
      return startTask(ctx, snapshot, action.taskId);
    case "remind_owner":
      return remindOwner(ctx, snapshot, action.taskId, action.ownerId);
    case "escalate":
      return escalate(ctx, snapshot, action.taskId, action.followUpId);
    case "propose_loaner":
      return proposeLoaner(ctx, snapshot, action.taskId);
    case "note_watching":
      return noteWatching(ctx, snapshot, action.taskId);
    case "nudge_employee":
      return nudgeEmployee(ctx, snapshot, action.taskId);
    case "open_relevant":
      return openRelevant(ctx, snapshot, action.taskId);
  }
}

async function startTask(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const template = task ? TEMPLATES.get(task.key as never) : undefined;
  if (!task || !template) return;
  const { employee } = snapshot;
  const fulfilment = template.fulfilment;
  ctx.acted = true;

  switch (fulfilment.kind) {
    case "hr_request": {
      if (fulfilment.type === "employee_id") {
        const due = atIst(addWorkingDays(dateKeyOf(ctx.clock), 4), "18:00");
        await callTool(ctx, createHrRequestTool, { taskId, type: "employee_id", dueAt: due, note: "Generate Employee ID" });
        await recordActivity(ctx, {
          caseKey: "setup",
          phase: "Acted",
          summary: `Asked HR for your Employee ID. Due ${formatShortDate(due)} under the 4-working-day standard (§4.0).`,
          taskId,
        });
      } else {
        await callTool(ctx, createHrRequestTool, { taskId, type: "id_card", dueAt: null, note: "Print ID card" });
        await recordActivity(ctx, { caseKey: "setup", phase: "Acted", summary: "Asked HR to print your ID card.", taskId });
      }
      return;
    }
    case "it_ticket": {
      const result = await callTool(ctx, createItRequest, { taskId, type: fulfilment.type, detail: fulfilment.detail });
      const ticket = result.data;
      const eta = ticket.expectedAt;
      const copy: Record<string, { summary: string; headline?: string; detail?: string }> = {
        laptop: { summary: `Sent laptop request ${ticket.id}. Delivery ${formatDay(eta)}.`, headline: "Laptop request sent", detail: `${ticket.id} · delivery ${weekdayName(eta)} ${formatShortDate(eta)}` },
        email: { summary: `Requested email account, ${ticket.id}.`, headline: "Email requested", detail: "Live Monday 9:00" },
        vpn: { summary: `Asked IT to set up VPN on your laptop, ${ticket.id}.` },
        access: { summary: `Asked IT to switch on email, VPN and core tools for ${formatDay(eta)} ${formatTime(eta)}.` },
        tool_access: { summary: `Requested project tool access for your first project, ${ticket.id}.`, headline: "Requested project tool access", detail: `${ticket.id} · ready ${weekdayName(eta)}` },
      };
      const entry = copy[fulfilment.type] ?? { summary: `Raised ${ticket.id}.` };
      await recordActivity(ctx, { caseKey: caseFor(task.key), phase: "Acted", summary: entry.summary, taskId, headline: entry.headline, headlineDetail: entry.detail });
      return;
    }
    case "training": {
      const due = atIst(TIMELINE.trainingDue, "23:59");
      await callTool(ctx, enrolTraining, { taskId, course: fulfilment.course, minutes: fulfilment.minutes, dueAt: due });
      const block = atIst(addCalendarDays(TIMELINE.trainingDue, -1), "10:00");
      await callTool(ctx, scheduleMeeting, {
        title: "Security training",
        kind: "training_block",
        startsAt: block,
        endsAt: atIst(addCalendarDays(TIMELINE.trainingDue, -1), "10:15"),
        location: "Learning portal",
        withPersonId: null,
        ownerType: "employee",
        linkedTaskId: null,
      });
      await recordActivity(ctx, {
        caseKey: "setup",
        phase: "Acted",
        summary: `Enrolled you in security training and blocked ${weekdayName(block)} ${formatTime(block)} on your calendar.`,
        taskId,
      });
      return;
    }
    case "booking": {
      const people = await listPeople(ctx.db, ctx.workspace.id);
      const { startsAt, endsAt } = slotTimes(employee.joiningDate, fulfilment.slot);
      const attendTask = snapshot.byKey.get(fulfilment.attendTask);
      const withPersonId =
        fulfilment.slot.with === "manager" ? employee.managerId : fulfilment.slot.with === "buddy" ? employee.buddyId : employee.hrOwnerId;
      await callTool(ctx, scheduleMeeting, {
        title: fulfilment.slot.title,
        kind: fulfilment.slot.kind,
        startsAt,
        endsAt,
        location: fulfilment.slot.location,
        withPersonId: withPersonId ?? null,
        ownerType: fulfilment.slot.with === "manager" ? "manager" : fulfilment.slot.with === "buddy" ? "buddy" : "hr",
        linkedTaskId: attendTask?.id ?? null,
      });
      const who = withPersonId ? (people.get(withPersonId)?.name ?? "") : "";
      const time = `${weekdayName(startsAt)} ${formatTime(startsAt)}`;
      const notes: Record<string, { note: string; detail: string; summary: string }> = {
        manager_1on1: { note: time, detail: `${time} with ${who}`, summary: `Booked 1:1 with ${who}, ${time}.` },
        buddy: { note: who, detail: `${who}, same team`, summary: `Matched buddy ${who}, same product team.` },
        induction: { note: time, detail: `${time}, ${fulfilment.slot.location}`, summary: `Booked company induction, ${time}.` },
      };
      const copy = notes[task.key] ?? { note: time, detail: time, summary: `Booked ${fulfilment.slot.title}.` };
      await callTool(ctx, updateTaskTool, { taskId, status: "completed", note: copy.note, reason: "Booked" });
      await recordActivity(ctx, { caseKey: "setup", phase: "Acted", summary: copy.summary, taskId, headline: fulfilment.bookedLabel, headlineDetail: copy.detail });
      return;
    }
    case "meeting": {
      const { startsAt, endsAt } = slotTimes(employee.joiningDate, fulfilment.slot);
      const withPersonId = fulfilment.slot.with === "manager" ? employee.managerId : null;
      await callTool(ctx, scheduleMeeting, {
        title: fulfilment.slot.title,
        kind: fulfilment.slot.kind,
        startsAt,
        endsAt,
        location: fulfilment.slot.location,
        withPersonId,
        ownerType: template.ownerType,
        linkedTaskId: taskId,
      });
      await callTool(ctx, updateTaskTool, { taskId, status: "waiting", note: `${weekdayName(startsAt)} ${formatTime(startsAt)}`, reason: "Scheduled" });
      return;
    }
    case "attend": {
      const events = await listEvents(ctx.db, ctx.workspace.id, employee.personId);
      const session = events.find((e) => e.taskId === taskId);
      const note = session ? `${weekdayName(session.startsAt)} ${formatTime(session.startsAt)} · ${session.location}` : null;
      await callTool(ctx, updateTaskTool, { taskId, status: session ? "waiting" : "pending", note, reason: "Scheduled" });
      return;
    }
    case "employee": {
      const note = task.key === "forms" ? "Pre-filled from your documents" : task.key === "day1_collect" ? `Mon 11:15 · ${COMPANY.pickupSite}` : null;
      await callTool(ctx, updateTaskTool, { taskId, status: "needs_user", note, reason: "Ready for you" });
      return;
    }
    case "vendor":
    case "facilities": {
      await callTool(ctx, updateTaskTool, { taskId, status: "in_progress", note: task.statusNote, reason: "Started" });
      return;
    }
    case "navo": {
      if (task.key === "pickup") await bookPickup(ctx, snapshot, taskId);
      return;
    }
  }
}

async function bookPickup(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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

async function remindOwner(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string, ownerId: string): Promise<void> {
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
    summary: `Reminded ${ownerName}, ${team}. Allowed automatically (§4.1).`,
    taskId,
    action: "send_reminder",
    headline: `Followed up with ${team}`,
    headlineDetail: `${task.name} is ${late} late`,
  });
  const plan = ["No reply in 24h → escalate to HR Ops lead (§4.2)."];
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

async function escalate(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string, followUpId: string): Promise<void> {
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
    summary: `Escalated to ${lead?.name ?? "the HR Ops lead"}, HR Ops lead. Allowed after 24h (§4.2).`,
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

async function proposeLoaner(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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
    reason: "Asset change · needs your approval (§4.2)",
    payload: { taskId },
  });
  await recordActivity(ctx, { caseKey: "empid", phase: "Asked", summary: "Loaner laptop is an asset change. Asked Anand to approve.", taskId, action: "request_loaner" });
  const narration = await narrate(ctx, {
    kind: "needs_approval",
    facts: { question: "Use a loaner laptop for Day 1?", detail },
  });
  await callTool(ctx, notifyEmployee, { title: "Navo needs your input", body: narration.text, needsYou: true, composedBy: narration.composedBy });
}

async function noteWatching(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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

async function nudgeEmployee(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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

async function openRelevant(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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
    summary: `Health cover enrolment closes ${formatDay(task.dueAt)}. Matched Benefits policy §3.2 to your family details.`,
    taskId,
    headline: "Spotted a benefits deadline",
    headlineDetail: `Closes ${formatShortDate(task.dueAt)}`,
  });
}

/** Group activity into the cases the Activity sheet shows. */
export function caseFor(key: string): string {
  if (["employee_id", "laptop", "email", "vpn", "id_card"].includes(key)) return "empid";
  if (["documents", "forms"].includes(key)) return "docs";
  if (key === "benefits_enrolment") return "benefits";
  return "setup";
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Lower-case a task name for use mid-sentence, keeping acronyms such as VPN or ID. */
function displayName(name: string): string {
  return name
    .split(" ")
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** How long an employee task takes, from its template ("It takes 15 minutes."). */
function effortOf(key: string): string {
  const fulfilment = TEMPLATES.get(key as never)?.fulfilment;
  return fulfilment?.kind === "training" ? `It takes ${fulfilment.minutes} minutes.` : "";
}

/** "Email and VPN access" → "email and VPN access", leaving acronyms alone. */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
