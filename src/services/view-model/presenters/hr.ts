/** The HR owner's console: exceptions, joiners, the cohort radar and the policy library. */
import { isAtRisk } from "@/domain/risk-engine";
import { atIst, calendarDaysUntil, dateKeyOf, formatDay, formatTime } from "@/domain/time";
import type { HrVM, Tone } from "../types";
import { presentRadar } from "./radar";
import type { Ctx} from "./context";
import { PHASE_TONE, done, lateBy, activityTime } from "./context";

export const OWNER_LABEL: Record<string, string> = { employee: "Joiner", hr: "HR", hr_ops: "HR", it: "IT", facilities: "Facilities", vendor: "Vendor", manager: "Manager", buddy: "Buddy", navo: "Navo" };

export function presentHr(ctx: Ctx): HrVM {
  const { state } = ctx;
  const featuredId = ctx.employee.personId;
  const empid = ctx.byKey.get("employee_id");
  const followUps = state.followUps.filter((f) => f.employeeId === featuredId && f.taskId === empid?.id && f.status !== "resolved");
  const reminder = followUps.find((f) => f.kind === "reminder");
  const escalation = followUps.find((f) => f.kind === "escalation");
  const queue: HrVM["queue"] = [];
  if (empid && !done(empid) && (reminder || escalation)) {
    queue.push(
      escalation
        ? {
            id: escalation.id,
            initials: "AM",
            title: "Escalated: Employee ID 24h overdue",
            who: ctx.name,
            body: `starts ${formatDay(ctx.day1Start)}`,
            navo: `escalated to ${state.people.get("neha.kapoor")?.name ?? "HR Ops"}${ctx.pendingApproval ? ", loaner awaiting Anand's OK" : ""}`,
            cta: "Generate ID",
            action: "generate_id",
            highlight: "risk",
          }
        : {
            id: reminder!.id,
            initials: "AM",
            title: "Employee ID not generated",
            who: ctx.name,
            body: `${empid.dueAt ? lateBy(empid.dueAt, ctx.now) : "Overdue"} late, blocks laptop and access`,
            navo: `reminded you at ${formatTime(reminder!.sentAt)}, escalates in 24h`,
            cta: "Generate ID",
            action: "generate_id",
            highlight: "agent",
          },
    );
  }
  for (const approval of state.approvals.filter((a) => a.requestedFrom === "priya.nair" && a.status === "pending")) {
    const who = state.people.get(approval.employeeId)?.name ?? approval.employeeId;
    queue.push({
      id: approval.id,
      initials: who.split(" ").map((p) => p[0]).join(""),
      title: approval.title,
      who,
      body: approval.detail,
      navo: approval.reason,
      cta: approval.action === "review_document" ? "Review" : "Decide",
      action: "none",
      highlight: "none",
    });
  }

  const joiners = [...state.employees]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.joiningDate.localeCompare(b.joiningDate))
    .slice(0, 6)
    .map((e) => {
      const personName = state.people.get(e.personId)?.name ?? e.personId;
      const open = state.tasks.filter((t) => t.employeeId === e.personId && t.status !== "completed" && (t.phase === "pre_joining" || t.phase === "documents"));
      const counts = new Map<string, number>();
      for (const t of open) if (t.status !== "blocked") counts.set(OWNER_LABEL[t.ownerType] ?? t.ownerType, (counts.get(OWNER_LABEL[t.ownerType] ?? t.ownerType) ?? 0) + 1);
      const openText = [...counts.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") || "Nothing open";
      let status = "On track";
      let tone: Tone = "done";
      if (e.featured) {
        if (done(ctx.byKey.get("pickup"))) status = "Ready";
        else if (isAtRisk(e.day1Risk)) [status, tone] = ["At risk", "risk"];
        else if (e.day1Risk === "medium") [status, tone] = ["Watching", "wait"];
      } else if (state.approvals.some((a) => a.employeeId === e.personId && a.status === "pending" && a.action === "decide_start_date")) {
        [status, tone] = ["Needs HR", "risk"];
      } else if (state.approvals.some((a) => a.employeeId === e.personId && a.status === "pending")) {
        [status, tone] = ["Watching", "wait"];
      }
      return { name: personName, role: e.role, start: formatDay(atIst(e.joiningDate, "09:00")), open: openText, status, tone };
    });

  const featured = joiners[0];
  const resolvedByNavo = state.activities.filter((a) => a.phase === "Acted" && calendarDaysUntil(a.at, ctx.now) < 7).length;
  const note = done(empid)
    ? "Nothing. Navo raised IT requests the moment the ID was issued."
    : escalation
      ? `Escalated to HR Ops after 24h.${ctx.pendingApproval ? " Navo asked Anand to approve a loaner." : ""}`
      : reminder
        ? "Employee ID is overdue. Generating it unblocks laptop, email and VPN automatically."
        : `Nothing yet. Navo is tracking ${ctx.tasks.filter((t) => t.watched).length} items.`;
  return {
    headline: queue.length === 1 ? "1 thing needs you." : `${queue.length} things need you.`,
    counts: {
      joining: state.employees.length,
      onTrack: joiners.filter((j) => j.tone === "done").length + Math.max(0, state.employees.length - joiners.length),
      needHr: queue.length,
      resolvedByNavo,
    },
    queue,
    joiners,
    featured: {
      status: featured?.status ?? "",
      note,
      tone: featured?.tone ?? "muted",
      feed: [...state.activities]
        .reverse()
        .slice(0, 12)
        .map((a) => ({ time: activityTime(a, ctx.now), phase: a.phase.toUpperCase(), text: a.summary, tone: PHASE_TONE[a.phase] })),
    },
    radar: presentRadar({
      reports: state.cohort,
      names: new Map([...state.people].map(([id, p]) => [id, p.name])),
      joiners: state.employees,
      taskNames: new Map(state.tasks.map((t) => [t.id, t.name])),
    }),
    policies: {
      items: state.policies,
      today: dateKeyOf(ctx.now),
      replaceable: state.policies.filter((p) => p.status === "in force").map((p) => ({ family: p.family, title: p.title, version: p.version })),
    },
  };
}
