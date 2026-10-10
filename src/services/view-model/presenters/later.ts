/** Day 1, week 1, day 30, the impact figures and the updates feed. */
import { COMPANY } from "@/content/company";
import { findFreeSlot } from "@/domain/scheduling";
import { addCalendarDays, atIst, calendarDaysUntil, dateKeyOf, formatDay, formatDayClock, formatShortDate, formatTime, weekdayName } from "@/domain/time";
import type { Day1VM, ImpactVM, Tone, UpdateVM, Week1VM } from "../types";
import type { Ctx} from "./context";
import { FULL_WEEKDAY, done } from "./context";

export function presentDay1(ctx: Ctx): Day1VM {
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
      ? `${nextDay.title} at ${formatTime(nextDay.startsAt)}.${toolAccess && toolAccess.status !== "pending" && toolAccess.status !== "blocked" ? " I've requested your project tool access." : ""}`
      : null,
    loaner,
    travelTip: `${COMPANY.office.split(",").slice(0, 2).join(",")} is about 40 min from ${ctx.employee.homeArea ?? "home"}. Leave by 8:30.`,
  };
}

export function presentWeek1(ctx: Ctx): Week1VM {
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
    return { name, day, done: isDone, sub: isDone ? "" : key === "tool_access" ? "Navo requesting project tool access" : (task?.statusNote ?? "") };
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

export function presentDay30(ctx: Ctx) {
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

export function presentImpact(ctx: Ctx): ImpactVM {
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

export function presentUpdates(ctx: Ctx): UpdateVM[] {
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
