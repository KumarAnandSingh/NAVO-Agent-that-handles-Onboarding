/** Starting a task: the right request to the right team, with permission and lead-time checks. */
import { COMPANY } from "@/content/company";
import { TIMELINE } from "@/content/timeline";
import { addCalendarDays, atIst, addWorkingDays, dateKeyOf, formatDay, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import { listEvents } from "@/mock-systems/calendar";
import { listPeople } from "@/services/onboarding-state/repository";
import { recordActivity, type AgentContext } from "../context";
import { TEMPLATES, type OnboardingSnapshot } from "../snapshot";
import { callTool } from "../tools/registry";
import { createHrRequestTool, createItRequest, enrolTraining, scheduleMeeting, updateTaskTool } from "../tools";
import { slotTimes, caseFor } from "./helpers";
import { bookPickup } from "./nudges";

export async function startTask(ctx: AgentContext, snapshot: OnboardingSnapshot, taskId: string): Promise<void> {
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
