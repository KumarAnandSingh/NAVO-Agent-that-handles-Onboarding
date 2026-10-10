import type { Guard } from "./types";

/**
 * Navo's autonomy model (Onboarding standards Section 4.3). Every action the agent wants to
 * take is checked here first. Unknown actions are rejected.
 */
export type Autonomy = "read" | "auto" | "ask_employee" | "hr_only";

export interface ActionPolicy {
  autonomy: Autonomy;
  description: string;
  policyRef: string;
  /** Optional precondition, evaluated against the action context. */
  condition?: (context: PermissionContext) => { ok: true } | { ok: false; reason: string };
}

export interface PermissionContext {
  /** Hours the related reminder has been open without an answer. */
  hoursSinceReminder?: number;
}

export type PermissionDecision =
  | { decision: "allow"; guard: Guard; reason: string; policyRef: string }
  | { decision: "needs_approval"; guard: "approval"; approver: "employee"; reason: string; policyRef: string }
  | { decision: "deny"; guard: "denied"; reason: string; policyRef: string };

export const ESCALATION_AFTER_HOURS = 24;

export const ACTION_POLICIES: Readonly<Record<string, ActionPolicy>> = {
  get_employee_context: { autonomy: "read", description: "Read the joiner's profile", policyRef: "Section 4.3" },
  get_onboarding_state: { autonomy: "read", description: "Read onboarding state", policyRef: "Section 4.3" },
  get_dependencies: { autonomy: "read", description: "Trace dependencies", policyRef: "Section 4.3" },
  calculate_day1_risk: { autonomy: "read", description: "Calculate Day 1 risk", policyRef: "Section 4.3" },
  search_policies: { autonomy: "read", description: "Search the policy library", policyRef: "Section 4.3" },
  check_sla: { autonomy: "read", description: "Check a reminder's response time", policyRef: "Section 4.2" },
  send_reminder: { autonomy: "auto", description: "Remind an owner about an overdue item", policyRef: "Section 4.1" },
  create_hr_request: { autonomy: "auto", description: "Raise an HR request", policyRef: "Section 4.3" },
  create_it_request: { autonomy: "auto", description: "Raise an IT request", policyRef: "Section 4.3" },
  schedule_meeting: { autonomy: "auto", description: "Book a meeting", policyRef: "Section 4.3" },
  schedule_pickup: { autonomy: "auto", description: "Book one pickup slot", policyRef: "Section 4.3" },
  enrol_training: { autonomy: "auto", description: "Enrol in a course and block time", policyRef: "Section 4.3" },
  update_task: { autonomy: "auto", description: "Update onboarding state", policyRef: "Section 4.3" },
  notify_employee: { autonomy: "auto", description: "Send the joiner an update", policyRef: "Section 4.3" },
  notify_owner: { autonomy: "auto", description: "Tell an owner something changed", policyRef: "Section 4.3" },
  escalate_owner: {
    autonomy: "auto",
    description: "Escalate an unanswered reminder to HR Operations",
    policyRef: "Section 4.2",
    condition: ({ hoursSinceReminder }) =>
      hoursSinceReminder !== undefined && hoursSinceReminder >= ESCALATION_AFTER_HOURS
        ? { ok: true }
        : { ok: false, reason: `Escalation is allowed only after ${ESCALATION_AFTER_HOURS}h without a reply` },
  },
  request_loaner: { autonomy: "ask_employee", description: "Request a loaner laptop (asset change)", policyRef: "Section 4.2" },
  update_personal_data: { autonomy: "ask_employee", description: "Change personal or bank details", policyRef: "Section 4.3" },
  enrol_benefits: { autonomy: "ask_employee", description: "Enrol in health cover", policyRef: "Section 3.2" },
  issue_employee_id: { autonomy: "hr_only", description: "Issue an Employee ID", policyRef: "Section 4.0" },
  change_start_date: { autonomy: "hr_only", description: "Move a joiner's start date", policyRef: "Section 4.3" },
};

/** Decide whether Navo may take `action` on its own, must ask, or must not. */
export function checkPermission(action: string, context: PermissionContext = {}): PermissionDecision {
  const policy = ACTION_POLICIES[action];
  if (!policy) {
    return { decision: "deny", guard: "denied", reason: `"${action}" is not an action Navo is allowed to take`, policyRef: "Section 4.3" };
  }
  if (policy.condition) {
    const check = policy.condition(context);
    if (!check.ok) return { decision: "deny", guard: "denied", reason: check.reason, policyRef: policy.policyRef };
  }
  switch (policy.autonomy) {
    case "read":
      return { decision: "allow", guard: "read", reason: "Read-only", policyRef: policy.policyRef };
    case "auto":
      return { decision: "allow", guard: "auto", reason: "Allowed automatically", policyRef: policy.policyRef };
    case "ask_employee":
      return {
        decision: "needs_approval",
        guard: "approval",
        approver: "employee",
        reason: `${policy.description} needs the joiner's approval`,
        policyRef: policy.policyRef,
      };
    case "hr_only":
      return { decision: "deny", guard: "denied", reason: `${policy.description} is an HR decision`, policyRef: policy.policyRef };
  }
}

/** Short label for the runtime panel, e.g. "allowed · auto" or "asset change · needs employee". */
export function describeDecision(decision: PermissionDecision): string {
  switch (decision.decision) {
    case "allow":
      return decision.guard === "read" ? "allowed · read" : "allowed · auto";
    case "needs_approval":
      return "needs employee approval";
    case "deny":
      return `denied · ${decision.reason}`;
  }
}
