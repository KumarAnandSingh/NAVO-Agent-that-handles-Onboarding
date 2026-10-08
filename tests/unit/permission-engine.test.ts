import { describe, expect, it } from "vitest";
import { checkPermission, describeDecision } from "@/domain/permission-engine";

describe("permission engine", () => {
  it.each(["send_reminder", "create_it_request", "schedule_meeting", "schedule_pickup", "notify_employee"])(
    "lets safe action %s run automatically",
    (action) => {
      const decision = checkPermission(action);
      expect(decision.decision).toBe("allow");
      expect(decision.guard).toBe("auto");
    },
  );

  it("treats reads as read-only", () => {
    expect(checkPermission("get_dependencies")).toMatchObject({ decision: "allow", guard: "read" });
  });

  it("requires the employee's approval for sensitive actions", () => {
    for (const action of ["request_loaner", "update_personal_data", "enrol_benefits"]) {
      expect(checkPermission(action)).toMatchObject({ decision: "needs_approval", approver: "employee", guard: "approval" });
    }
  });

  it("rejects unauthorised actions", () => {
    expect(checkPermission("delete_employee")).toMatchObject({ decision: "deny", guard: "denied" });
    expect(checkPermission("issue_employee_id")).toMatchObject({ decision: "deny" });
    expect(checkPermission("change_start_date").reason).toMatch(/HR decision/);
  });

  it("allows escalation only after 24 hours without a reply", () => {
    expect(checkPermission("escalate_owner", { hoursSinceReminder: 3 })).toMatchObject({ decision: "deny" });
    expect(checkPermission("escalate_owner")).toMatchObject({ decision: "deny" });
    expect(checkPermission("escalate_owner", { hoursSinceReminder: 24 })).toMatchObject({ decision: "allow", policyRef: "§4.2" });
  });

  it("describes decisions for the runtime panel", () => {
    expect(describeDecision(checkPermission("send_reminder"))).toBe("allowed · auto");
    expect(describeDecision(checkPermission("get_onboarding_state"))).toBe("allowed · read");
    expect(describeDecision(checkPermission("request_loaner"))).toBe("needs employee approval");
    expect(describeDecision(checkPermission("nope"))).toMatch(/^denied/);
  });
});
