/** The Employee ID tracker: the chain from a late ID to everything waiting on it. */
import { formatDayClock, formatShortDate } from "@/domain/time";
import type { IdTrackerVM, Tone } from "../types";
import type { Ctx} from "./context";
import { done, lateBy } from "./context";

export function presentIdTracker(ctx: Ctx): IdTrackerVM {
  const empid = ctx.byKey.get("employee_id");
  const issued = done(empid);
  const followUps = ctx.state.followUps.filter((f) => f.taskId === empid?.id);
  const reminder = followUps.find((f) => f.kind === "reminder");
  const escalation = followUps.find((f) => f.kind === "escalation");
  const statusOf = (key: string) => {
    const task = ctx.byKey.get(key);
    if (!task) return "";
    if (task.status === "completed") return task.statusNote ?? "Done";
    return task.statusNote ?? task.blockedReason ?? "Waiting";
  };
  const deps = [
    { name: "ID card", owner: "HR", status: statusOf("id_card") },
    { name: "Laptop", owner: "IT", status: statusOf("laptop") },
    { name: "Email", owner: "IT", status: statusOf("email") },
    { name: "VPN, tools", owner: "IT", status: statusOf("vpn") },
  ];
  const bars = ["Requested", "Processing", "Generated", "Available"].map((label, i) => ({
    label,
    tone: (issued || i === 0 ? "done" : i === 1 ? "wait" : "muted") as Tone,
    current: !issued && i === 1,
  }));
  const base = { bars, deps };
  if (issued) {
    return {
      ...base,
      face: "celebrating",
      kicker: "RESOLVED",
      tone: "done",
      head: `Your Employee ID is ${ctx.employee.employeeNumber ?? "issued"}.`,
      sub: "Laptop, email and VPN requests went out right after.",
      impact: "None",
      next: statusOf("laptop") ? `Laptop: ${statusOf("laptop")}` : "Nothing pending",
      foot: "Back on track for Monday.",
      footTone: "done",
    };
  }
  const due = empid?.dueAt;
  if (escalation) {
    return {
      ...base,
      face: "concerned",
      kicker: "ESCALATED",
      tone: "risk",
      head: "Your Employee ID hasn't been generated yet.",
      sub: "HR didn't reply within 24 hours, so I escalated to the HR Ops lead.",
      impact: "High · escalated to HR Ops",
      next: ctx.pendingApproval ? "Loaner laptop needs your OK" : "HR Ops is generating it",
      foot: ctx.pendingApproval ? "One decision needed on Home." : "You don't need to do anything.",
      footTone: ctx.pendingApproval ? "you" : "done",
    };
  }
  if (reminder) {
    return {
      ...base,
      face: "concerned",
      kicker: "POTENTIAL DELAY DETECTED",
      tone: "risk",
      head: "Your Employee ID hasn't been generated yet.",
      sub: "Your ID card, laptop and access depend on it. I've already followed up with HR.",
      impact: ctx.employee.day1Risk === "critical" ? "Critical · laptop can't make Day 1" : "High · no working days of slack",
      next: ctx.pendingApproval ? "Loaner laptop needs your OK" : `Escalate ${formatDayClock(reminder.slaDueAt)} if no reply`,
      foot: ctx.pendingApproval ? "One decision needed on Home." : "You don't need to do anything.",
      footTone: ctx.pendingApproval ? "you" : "done",
    };
  }
  const late = due ? due.getTime() < ctx.now.getTime() : false;
  return {
    ...base,
    face: "watching",
    kicker: "WATCHING",
    tone: late ? "wait" : "muted",
    head: late ? `Your Employee ID is ${lateBy(due as Date, ctx.now)} late.` : "Your Employee ID is being processed.",
    sub: due ? (late ? "The laptop still has slack. I'll act tomorrow morning if it's still missing." : `Due ${formatShortDate(due)} from HR. I'm keeping an eye on it.`) : "HR starts once your documents are verified.",
    impact: late ? "Low · slack shrinking" : "None yet",
    next: "I'll check again at 09:15",
    foot: "You don't need to do anything.",
    footTone: "done",
  };
}
