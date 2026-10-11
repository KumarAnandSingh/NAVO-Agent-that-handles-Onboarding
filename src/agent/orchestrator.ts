/**
 * The onboarding agent's loop. One event in, then:
 * gather context → inspect state → evaluate dependencies and risk (deterministic) →
 * pick next-best actions (playbooks) → check permission → act through tools →
 * persist state → record activity → notify → re-evaluate until nothing is left to do.
 *
 * This file routes events; handlers.ts reacts to each one and reconcile.ts runs the loop.
 */
import { formatShortDate } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { completeHrRequest } from "@/mock-systems/hr";
import { clearCheck, markItemReady } from "@/mock-systems/vendor-facilities";
import type { EventRow } from "@/services/events/queue";
import { getEmployee } from "@/services/onboarding-state/repository";
import type { Workspace } from "@/services/workspace";
import { taskKeyOf } from "./tools";
import { payloadString, type AgentDeps, type EventOutcome } from "./reconcile";
import { dailyCheck, employeeIdIssued, ticketReady, ticketDelayed, simpleCompletion, slaCheck, deadlineCheck, approvalDecided, employeeAction } from "./handlers";

export { reconcile, type AgentDeps, type EventOutcome } from "./reconcile";

/** Route one queued event to its handler. Throws on unknown types so nothing is silently lost. */
export async function handleEvent(db: Queryable, workspace: Workspace, event: EventRow, deps: AgentDeps): Promise<EventOutcome> {
  const employeeId = typeof event.payload.employeeId === "string" ? event.payload.employeeId : null;
  if (employeeId) {
    const employee = await getEmployee(db, workspace.id, employeeId);
    if (!employee.simulated) return "ignored";
  }
  switch (event.type) {
    case "navo.daily_check":
      return dailyCheck(db, workspace, event, deps);
    case "hr.employee_id_issued":
      return employeeIdIssued(db, workspace, event, deps);
    case "hr.id_card_printed": {
      const request = typeof event.payload.requestId === "string" ? event.payload.requestId : null;
      if (request) await completeHrRequest(db, workspace.id, request, event.dueAt);
      return simpleCompletion(db, workspace, event, deps, {
        key: "id_card",
        note: "Printed",
        trigger: "HR printed ID card",
        eventType: "hr.id_card.printed",
        detail: "ready",
        summary: "HR printed your ID card.",
        headline: "ID card printed",
        headlineDetail: "Collect at your Day 1 pickup",
      });
    }
    case "it.ticket_ready":
      return ticketReady(db, workspace, event, deps);
    case "it.ticket_delayed":
      return ticketDelayed(db, workspace, event, deps);
    case "vendor.check_cleared": {
      const cleared = await clearCheck(db, workspace.id, payloadString(event, "checkId"), event.dueAt);
      if (!cleared) return "ignored";
      return simpleCompletion(db, workspace, event, deps, {
        key: "background_check",
        note: "Cleared",
        trigger: "Vendor cleared background check",
        eventType: "vendor.bgv.cleared",
        detail: "ok",
        summary: "Background check cleared by the vendor.",
        headline: "Background check cleared",
        headlineDetail: "Vendor confirmed",
      });
    }
    case "facilities.item_ready": {
      const ready = await markItemReady(db, workspace.id, payloadString(event, "itemId"), event.dueAt);
      if (!ready) return "ignored";
      return simpleCompletion(db, workspace, event, deps, {
        key: "onboarding_kit",
        note: "Ready at Building B",
        trigger: "Facilities prepared the kit",
        eventType: "facilities.kit.ready",
        detail: "ok",
        summary: "Facilities has your onboarding kit ready.",
      });
    }
    case "calendar.event_ended": {
      const taskId = payloadString(event, "taskId");
      return simpleCompletion(db, workspace, event, deps, {
        key: taskKeyOf(taskId),
        note: `Done ${formatShortDate(event.dueAt)}`,
        trigger: "Session ended",
        eventType: "calendar.event.ended",
        detail: taskKeyOf(taskId),
        summary: `${event.label.replace(/ ends$/, "")} done.`,
      });
    }
    case "sla.check":
      return slaCheck(db, workspace, event, deps);
    case "navo.deadline_check":
      return deadlineCheck(db, workspace, event, deps);
    case "employee.approval_decided":
      return approvalDecided(db, workspace, event, deps);
    case "employee.action":
      return employeeAction(db, workspace, event, deps);
    default:
      throw new Error(`No handler for event type ${event.type}`);
  }
}
