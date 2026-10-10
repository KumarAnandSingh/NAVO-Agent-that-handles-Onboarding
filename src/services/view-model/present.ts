/**
 * Pure presenter: database state in, view model out. No I/O, so every screen's copy and
 * counts can be unit tested against a fixture state. Each screen has its own presenter
 * in ./presenters.
 */
import { atIst, calendarDaysUntil, formatDay, formatDayClock, formatLongDate, formatTime } from "@/domain/time";
import type { LoadedState } from "./load";
import type { AiStatusVM, ViewModel } from "./types";
import type { Ctx} from "./presenters/context";
import { chapterOf } from "./presenters/context";
import { presentHome } from "./presenters/home";
import { presentDocuments, presentForms } from "./presenters/documents";
import { presentIdTracker } from "./presenters/id-tracker";
import { presentJourney, presentActivity } from "./presenters/journey";
import { presentDay1, presentWeek1, presentDay30, presentImpact, presentUpdates } from "./presenters/later";
import { presentHr } from "./presenters/hr";
import { presentRuntime } from "./presenters/runtime";

export interface PresentOptions {
  ai: AiStatusVM;
}

export function present(state: LoadedState, options: PresentOptions): ViewModel {
  const now = state.workspace.simNow;
  const employee = state.employees.find((e) => e.personId === state.employeeId);
  if (!employee) throw new Error("Featured employee missing");
  const person = state.people.get(employee.personId);
  const name = person?.name ?? employee.personId;
  const tasks = state.tasks.filter((t) => t.employeeId === employee.personId);
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const day1Start = atIst(employee.joiningDate, "09:00");
  const pendingApproval = state.approvals.find((a) => a.employeeId === employee.personId && a.status === "pending" && a.requestedFrom === employee.personId) ?? null;
  const ctx: Ctx = { state, now, employee, name, tasks, byKey, day1Start, pendingApproval };
  const chapter = chapterOf(ctx);

  return {
    workspace: { id: state.workspace.id, scenario: state.workspace.scenario, itDelay: state.workspace.flags.itDelay === true },
    clock: { iso: now.toISOString(), time: formatTime(now), day: formatDay(now), dayClock: formatDayClock(now) },
    chapter,
    employee: {
      id: employee.personId,
      name,
      firstName: name.split(" ")[0] ?? name,
      initials: name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2),
      role: employee.role,
      day1: formatDay(day1Start),
      day1Long: formatLongDate(day1Start),
      daysToDay1: Math.max(0, calendarDaysUntil(now, day1Start)),
      employeeNumber: employee.employeeNumber,
      managerName: state.people.get(employee.managerId)?.name ?? "",
      buddyName: employee.buddyId ? (state.people.get(employee.buddyId)?.name ?? "") : "",
      hrName: state.people.get(employee.hrOwnerId)?.name ?? "",
    },
    home: presentHome(ctx, chapter),
    documents: presentDocuments(ctx),
    forms: presentForms(ctx),
    idTracker: presentIdTracker(ctx),
    journey: presentJourney(ctx, chapter),
    activity: presentActivity(ctx),
    day1: presentDay1(ctx),
    week1: presentWeek1(ctx),
    day30: presentDay30(ctx),
    updates: presentUpdates(ctx),
    impact: presentImpact(ctx),
    hr: presentHr(ctx),
    runtime: presentRuntime(ctx, options),
    pendingApproval: pendingApproval ? { id: pendingApproval.id, title: pendingApproval.title, detail: pendingApproval.detail } : null,
  };
}
