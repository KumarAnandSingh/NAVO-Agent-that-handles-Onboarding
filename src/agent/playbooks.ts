/**
 * Next-best-action playbooks. A pure function from an onboarding snapshot to the
 * actions Navo should take now. Deterministic on purpose: the same state always yields
 * the same plan, which keeps the agent explainable, testable and the demo reproducible.
 * Every action is still checked by the permission engine before it runs.
 */
import { isBreached } from "@/domain/sla";
import { isAtRisk, riskRank } from "@/domain/risk-engine";
import type { TaskKey } from "@/content/seed/onboarding-template";
import { addCalendarDays, atIst, dateKeyOf } from "@/domain/time";
import type { OnboardingSnapshot } from "./snapshot";
import type { TaskRow } from "@/services/onboarding-state/repository";

export type PlannedAction =
  | { kind: "start_task"; taskId: string }
  | { kind: "remind_owner"; taskId: string; ownerId: string }
  | { kind: "escalate"; taskId: string; followUpId: string }
  | { kind: "propose_loaner"; taskId: string }
  | { kind: "note_watching"; taskId: string }
  | { kind: "nudge_employee"; taskId: string }
  | { kind: "open_relevant"; taskId: string };

/** Teams Navo can chase. Employee-owned items get a nudge instead. */
const CHASEABLE = new Set(["hr", "it", "facilities", "vendor"]);

/** How many days before a deadline an employee item becomes "relevant now". */
export const RELEVANT_WINDOW_DAYS = 5;

export const noteKey = (kind: string, taskId: string) => `${kind}:${taskId}`;

export function planActions(snapshot: OnboardingSnapshot): PlannedAction[] {
  const actions: PlannedAction[] = [];

  // 1. Start anything whose blocking prerequisites are now complete.
  for (const task of snapshot.tasks) {
    if (task.status === "blocked" && snapshot.graph.isEligible(task.id)) {
      actions.push({ kind: "start_task", taskId: task.id });
    }
  }

  // 2. Protect Day 1: act on whatever is late upstream of the riskiest Day-1 item.
  const { risk } = snapshot;
  if (risk.driver) {
    const driverNode = snapshot.graph.task(risk.driver.taskId);
    const causes = risk.driver.overdue ? [driverNode, ...risk.driver.overdueUpstream] : risk.driver.overdueUpstream;
    for (const cause of causes) {
      const task = snapshot.tasks.find((t) => t.id === cause.id);
      if (!task) continue;
      actions.push(...planForLateItem(snapshot, task, risk.driver.level));
    }
    const driverTask = snapshot.tasks.find((t) => t.id === risk.driver?.taskId);
    if (driverTask && risk.driver.willMiss && driverTask.key === "laptop" && !hasLoanerRequest(snapshot)) {
      actions.push({ kind: "propose_loaner", taskId: driverTask.id });
    }
  }

  // 3. After Day 1, nudge the joiner about their own overdue items (before Day 1, step 2 covers it).
  if (snapshot.day1Passed) {
    for (const task of snapshot.tasks) {
      if (task.ownerType !== "employee" || task.status === "completed" || task.status === "blocked") continue;
      if (task.dueAt && task.dueAt.getTime() < snapshot.now.getTime()) actions.push(...planForLateItem(snapshot, task, "high"));
    }
  }

  // 4. Bring up employee items at the right moment, not all at once.
  const benefits = snapshot.byKey.get("benefits_enrolment" satisfies TaskKey);
  if (benefits && benefits.status === "pending" && benefits.dueAt) {
    const opensAt = atIst(addCalendarDays(dateKeyOf(benefits.dueAt), -RELEVANT_WINDOW_DAYS), "09:00");
    if (snapshot.now.getTime() >= opensAt.getTime()) actions.push({ kind: "open_relevant", taskId: benefits.id });
  }

  return dedupe(actions);
}

function planForLateItem(snapshot: OnboardingSnapshot, task: TaskRow, driverLevel: OnboardingSnapshot["risk"]["day1Level"]): PlannedAction[] {
  if (task.ownerType === "employee") {
    return snapshot.notes.has(noteKey("nudge", task.id)) ? [] : [{ kind: "nudge_employee", taskId: task.id }];
  }
  if (!CHASEABLE.has(task.ownerType) || !task.ownerId) return [];

  const history = snapshot.followUps.filter((f) => f.taskId === task.id);
  const reminder = history.find((f) => f.kind === "reminder");
  const escalation = history.find((f) => f.kind === "escalation");

  if (!reminder) {
    if (isAtRisk(driverLevel)) return [{ kind: "remind_owner", taskId: task.id, ownerId: task.ownerId }];
    if (riskRank(driverLevel) >= riskRank("medium") && !snapshot.notes.has(noteKey("watching", task.id))) {
      return [{ kind: "note_watching", taskId: task.id }];
    }
    return [];
  }
  if (!escalation && reminder.status !== "resolved" && isBreached(reminder, snapshot.now)) {
    return [{ kind: "escalate", taskId: task.id, followUpId: reminder.id }];
  }
  return [];
}

function hasLoanerRequest(snapshot: OnboardingSnapshot): boolean {
  return (
    snapshot.approvals.some((a) => a.action === "request_loaner" && a.status !== "declined") ||
    snapshot.tickets.some((t) => t.type === "loaner")
  );
}

function dedupe(actions: PlannedAction[]): PlannedAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.kind}:${action.taskId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

