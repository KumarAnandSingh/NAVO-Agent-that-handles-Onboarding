import { and, eq } from "drizzle-orm";
import { ONBOARDING_TEMPLATE, type TaskKey, type TaskTemplate } from "@/content/seed/onboarding-template";
import type { DependencyGraph } from "@/domain/dependency-engine";
import { assessRisk, type RiskReport } from "@/domain/risk-engine";
import { addMinutes, atIst } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { activities, approvals, followUps, itTickets, vendorChecks } from "@/lib/db/schema";
import { getEmployee, loadGraph, type EmployeeRow, type TaskRow } from "@/services/onboarding-state/repository";

export type FollowUpRow = typeof followUps.$inferSelect;
export type ApprovalRow = typeof approvals.$inferSelect;
export type TicketRow = typeof itTickets.$inferSelect;

export const TEMPLATES = new Map<TaskKey, TaskTemplate>(ONBOARDING_TEMPLATE.map((t) => [t.key, t]));

/** Everything the planner needs to decide, loaded once per reconcile pass. */
export interface OnboardingSnapshot {
  now: Date;
  employee: EmployeeRow;
  day1Start: Date;
  tasks: TaskRow[];
  byKey: Map<TaskKey, TaskRow>;
  graph: DependencyGraph;
  risk: RiskReport;
  /** Day 1 has started: Day-1 risk no longer applies. */
  day1Passed: boolean;
  followUps: FollowUpRow[];
  approvals: ApprovalRow[];
  tickets: TicketRow[];
  /** Keys of one-off notes Navo already made (e.g. "watching:anand.mehta/employee_id"). */
  notes: Set<string>;
}

export type CheckRow = typeof vendorChecks.$inferSelect;

/**
 * Completion dates the owning systems committed to: open IT tickets and an in-progress
 * vendor check. They override lead-time projections in the risk engine.
 */
export function committedEtas(byKey: ReadonlyMap<string, { id: string; status: string }>, ticketRows: readonly TicketRow[], checkRows: readonly CheckRow[], now: Date): Map<string, Date> {
  const etas = new Map<string, Date>();
  const openTicket = (type: TicketRow["type"]) => ticketRows.find((t) => t.type === type && t.status === "in_progress");
  const ticketTasks: [TicketRow["type"], TaskKey][] = [
    ["email", "email"],
    ["vpn", "vpn"],
    ["access", "access_activation"],
    ["tool_access", "tool_access"],
  ];
  for (const [type, key] of ticketTasks) {
    const ticket = openTicket(type);
    const task = byKey.get(key);
    if (ticket && task) etas.set(task.id, ticket.expectedAt);
  }
  // The laptop is covered by whichever arrives first: the joiner's own laptop or an approved loaner.
  const laptopCandidates = [openTicket("laptop"), openTicket("loaner")].filter((t): t is TicketRow => Boolean(t));
  const laptopTask = byKey.get("laptop");
  const vpnTask = byKey.get("vpn");
  if (laptopTask && laptopCandidates.length > 0) {
    const earliest = laptopCandidates.reduce((a, b) => (a.expectedAt.getTime() <= b.expectedAt.getTime() ? a : b));
    etas.set(laptopTask.id, earliest.expectedAt);
    if (vpnTask && !openTicket("vpn") && vpnTask.status !== "completed") etas.set(vpnTask.id, addMinutes(earliest.expectedAt, 5));
  }
  const bgvTask = byKey.get("background_check");
  const check = checkRows.find((c) => c.status === "in_progress");
  if (bgvTask && check && check.expectedAt.getTime() > now.getTime()) etas.set(bgvTask.id, check.expectedAt);
  return etas;
}

export async function loadSnapshot(db: Queryable, workspaceId: string, employeeId: string, now: Date): Promise<OnboardingSnapshot> {
  const employee = await getEmployee(db, workspaceId, employeeId);
  const { rows, graph } = await loadGraph(db, workspaceId, employeeId);
  const byKey = new Map(rows.map((r) => [r.key as TaskKey, r]));
  const followUpRows = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.workspaceId, workspaceId), eq(followUps.employeeId, employeeId)));
  const approvalRows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.employeeId, employeeId)));
  const ticketRows = await db
    .select()
    .from(itTickets)
    .where(and(eq(itTickets.workspaceId, workspaceId), eq(itTickets.employeeId, employeeId)));
  const checkRows = await db
    .select()
    .from(vendorChecks)
    .where(and(eq(vendorChecks.workspaceId, workspaceId), eq(vendorChecks.employeeId, employeeId)));
  const noteRows = await db
    .select({ action: activities.action })
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.employeeId, employeeId)));

  const day1Start = atIst(employee.joiningDate, "09:00");
  const etas = committedEtas(byKey, ticketRows, checkRows, now);

  // Day-1 risk is about getting ready for Day 1. Once Day 1 has started it is closed:
  // anything still open is simply overdue, and the playbooks chase it as such.
  const day1Passed = now.getTime() >= day1Start.getTime();
  const risk: RiskReport = day1Passed ? { day1Level: "none", byTask: new Map(), driver: null, driverLastSafeStart: null } : assessRisk({ graph, now, day1Start, etas });
  const notes = new Set(noteRows.map((r) => r.action).filter((a): a is string => Boolean(a)));

  return {
    now,
    employee,
    day1Start,
    day1Passed,
    tasks: rows,
    byKey,
    graph,
    risk,
    followUps: followUpRows,
    approvals: approvalRows,
    tickets: ticketRows,
    notes,
  };
}
