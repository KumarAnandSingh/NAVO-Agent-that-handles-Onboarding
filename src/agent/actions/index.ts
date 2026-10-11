/**
 * How Navo carries out each planned action: which tools it calls, in what order, and the
 * product-level explanation it records (what changed, why, what it did, what's next).
 */
import type { AgentContext } from "../context";
import type { PlannedAction } from "../playbooks";
import type { OnboardingSnapshot } from "../snapshot";
import { startTask } from "./start-task";
import { remindOwner, escalate, proposeLoaner } from "./follow-up";
import { noteWatching, nudgeEmployee, openRelevant } from "./nudges";

export { caseFor, slotTimes } from "./helpers";

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
