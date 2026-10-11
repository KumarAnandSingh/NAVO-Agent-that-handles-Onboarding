/** Scheduling tools: meetings, the Day 1 pickup and training enrolment. */
import { z } from "zod";
import { COMPANY } from "@/content/company";
import { formatDay, formatDayClock } from "@/domain/time";
import { bookEvent } from "@/mock-systems/calendar";
import { enrol } from "@/mock-systems/learning";
import { getTask, updateTask } from "@/services/onboarding-state/repository";
import { defineTool, formatArgs } from "./registry";

export const scheduleMeeting = defineTool({
  name: "schedule_meeting",
  description: "Book a session on the joiner's calendar.",
  guard: "auto",
  input: z.object({
    title: z.string(),
    kind: z.string(),
    startsAt: z.date(),
    endsAt: z.date(),
    location: z.string(),
    withPersonId: z.string().nullable(),
    ownerType: z.enum(["employee", "hr", "hr_ops", "it", "manager", "buddy", "facilities", "vendor", "navo"]),
    linkedTaskId: z.string().nullable(),
  }),
  summarizeArgs: ({ title }) => formatArgs({ title }),
  async run(ctx, input) {
    const event = await bookEvent(ctx.db, ctx.workspace.id, {
      employeeId: ctx.employeeId,
      kind: input.kind,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withPersonId: input.withPersonId,
      ownerType: input.ownerType,
      taskId: input.linkedTaskId,
    });
    return { summary: `booked ${formatDayClock(event.startsAt)}`, data: event };
  },
});

export const schedulePickup = defineTool({
  name: "schedule_pickup",
  description: "Book one pickup slot for everything waiting for the joiner.",
  guard: "auto",
  input: z.object({ site: z.string(), startsAt: z.date(), endsAt: z.date(), items: z.array(z.string()).min(1), linkedTaskId: z.string() }),
  summarizeArgs: ({ startsAt }) => formatArgs({ site: COMPANY.pickupSite, at: formatDayClock(startsAt) }),
  async run(ctx, input) {
    const event = await bookEvent(ctx.db, ctx.workspace.id, {
      employeeId: ctx.employeeId,
      kind: "pickup",
      title: `Collect ${input.items.join(", ")}`,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.site,
      ownerType: "employee",
      taskId: null,
    });
    return { summary: "booked", data: event };
  },
});

export const enrolTraining = defineTool({
  name: "enrol_training",
  description: "Enrol the joiner in a course and block time on their calendar.",
  guard: "auto",
  input: z.object({ taskId: z.string(), course: z.string(), minutes: z.number().int().positive(), dueAt: z.date() }),
  summarizeArgs: ({ course }) => formatArgs({ course }),
  async run(ctx, { taskId, course, minutes, dueAt }) {
    const enrolment = await enrol(ctx.db, ctx.workspace.id, { employeeId: ctx.employeeId, course, minutes, dueAt });
    const task = await getTask(ctx.db, ctx.workspace.id, taskId);
    await updateTask(
      ctx.db,
      task,
      { status: "needs_user", dueAt, statusNote: `${minutes} min · due ${formatDay(dueAt)}` },
      { actor: "navo", at: ctx.clock, reason: "Enrolled" },
    );
    return { summary: `enrolled · due ${formatDay(dueAt)}`, data: enrolment };
  },
});
