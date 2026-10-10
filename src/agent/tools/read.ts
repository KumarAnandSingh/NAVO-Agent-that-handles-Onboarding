/** Read tools: state, dependencies, risk, policy, calendar and follow-ups. They change nothing. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { describeDecision, checkPermission } from "@/domain/permission-engine";
import { hoursOpen } from "@/domain/sla";
import { formatDayClock } from "@/domain/time";
import { approvals, followUps } from "@/lib/db/schema";
import { listEvents } from "@/mock-systems/calendar";
import { searchPolicies } from "@/services/policy-retrieval";
import { getEmployee } from "@/services/onboarding-state/repository";
import { loadSnapshot } from "../snapshot";
import { defineTool, formatArgs } from "./registry";

export const taskKeyOf = (taskId: string) => taskId.split("/")[1] ?? taskId;

const RISK_LABEL = { none: "NONE", low: "LOW", medium: "MEDIUM", high: "HIGH", critical: "CRITICAL" } as const;

/* ---------------- Read tools ---------------- */

export const getEmployeeContext = defineTool({
  name: "get_employee_context",
  description: "Read the joiner's profile: role, manager, buddy, joining date, location and work mode.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const employee = await getEmployee(ctx.db, ctx.workspace.id, employeeId);
    return {
      summary: `${employee.role} · joins ${employee.joiningDate} · ${employee.workMode}`,
      data: employee,
    };
  },
});

export const getOnboardingState = defineTool({
  name: "get_onboarding_state",
  description: "Read every onboarding task with status, owner, deadline and risk.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    const overdue = snapshot.tasks.filter((t) => t.status !== "completed" && t.dueAt && t.dueAt.getTime() < ctx.clock.getTime());
    const open = snapshot.tasks.filter((t) => t.status !== "completed").length;
    const overdueText = overdue.length ? ` · ${overdue.length} overdue: ${overdue.map((t) => t.key).join(", ")}` : " · none overdue";
    return { summary: `${open} open tasks${overdueText}`, data: snapshot.tasks };
  },
});

export const getDependencies = defineTool({
  name: "get_dependencies",
  description: "Trace what a task waits on and what waits on it.",
  guard: "read",
  input: z.object({ taskId: z.string().min(1) }),
  summarizeArgs: ({ taskId }) => formatArgs({ task: taskKeyOf(taskId) }),
  async run(ctx, { taskId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, ctx.employeeId, ctx.clock);
    const upstream = snapshot.graph.blockingPrerequisites(taskId).map((t) => t.key);
    const downstream = snapshot.graph
      .directDependents(taskId)
      .filter((t) => t.requiredForDay1)
      .map((t) => t.key);
    const parts = [upstream.join(", "), taskKeyOf(taskId), downstream.join(", ")].filter(Boolean);
    return { summary: parts.join(" → "), data: { upstream, downstream } };
  },
});

export const calculateDay1Risk = defineTool({
  name: "calculate_day1_risk",
  description: "Calculate Day 1 risk with explicit rules (working-day lead times, slack, overdue prerequisites).",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: () => formatArgs({ joining: "Day 1" }),
  async run(ctx, { employeeId }) {
    const snapshot = await loadSnapshot(ctx.db, ctx.workspace.id, employeeId, ctx.clock);
    if (snapshot.day1Passed) {
      const overdue = snapshot.tasks.filter((t) => t.status !== "completed" && t.dueAt && t.dueAt.getTime() < ctx.clock.getTime()).length;
      return { summary: `Day 1 has passed · ${overdue} overdue`, data: snapshot.risk };
    }
    const { day1Level, driver } = snapshot.risk;
    let detail = "";
    if (driver?.willMiss) detail = " · will miss Day 1";
    else if (driver && driver.slackWorkingDays !== null) detail = ` · ${driver.slackWorkingDays} working days slack`;
    else if (day1Level === "none") detail = snapshot.tasks.every((t) => !t.requiredForDay1 || t.status === "completed") ? " · ready" : " · on track";
    return { summary: `${RISK_LABEL[day1Level]}${detail}`, data: snapshot.risk };
  },
});

export const searchPolicyLibrary = defineTool({
  name: "search_policies",
  description: "Search Halden's current policy library. Returns the most relevant sections with their refs.",
  guard: "read",
  input: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(5).optional() }),
  summarizeArgs: ({ query }) => formatArgs({ query }),
  async run(ctx, { query, limit }) {
    const hits = await searchPolicies(ctx.db, query, { asOf: ctx.clock, workspaceId: ctx.workspace.id, limit: limit ?? 3 });
    return {
      summary: hits.length ? hits.map((h) => `${h.ref} ${h.title}`).join(" · ") : "no relevant policy",
      data: hits,
    };
  },
});

export const getCalendar = defineTool({
  name: "get_calendar",
  description: "Read the joiner's booked sessions: induction, pickup, 1:1s, trainings and check-ins.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const events = await listEvents(ctx.db, ctx.workspace.id, employeeId);
    const upcoming = events.filter((e) => e.endsAt.getTime() >= ctx.clock.getTime());
    return { summary: `${upcoming.length} upcoming · next ${upcoming[0] ? formatDayClock(upcoming[0].startsAt) : "none"}`, data: events };
  },
});

export const getFollowUps = defineTool({
  name: "get_follow_ups",
  description: "Read Navo's reminders, escalations and approval requests for the joiner, with reply windows.",
  guard: "read",
  input: z.object({ employeeId: z.string().min(1) }),
  summarizeArgs: ({ employeeId }) => formatArgs({ employee: employeeId }),
  async run(ctx, { employeeId }) {
    const sent = await ctx.db
      .select()
      .from(followUps)
      .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.employeeId, employeeId)));
    const asks = await ctx.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.workspaceId, ctx.workspace.id), eq(approvals.employeeId, employeeId), eq(approvals.requestedFrom, employeeId)));
    const open = sent.filter((f) => f.status !== "resolved").length;
    return { summary: `${sent.length} follow-ups (${open} open) · ${asks.length} approvals`, data: { followUps: sent, approvals: asks } };
  },
});

export const checkSla = defineTool({
  name: "check_sla",
  description: "Check whether a reminder has been answered within its 24-hour window.",
  guard: "read",
  input: z.object({ followUpId: z.string().min(1) }),
  summarizeArgs: ({ followUpId }) => formatArgs({ reminder: followUpId }),
  async run(ctx, { followUpId }) {
    const [row] = await ctx.db
      .select()
      .from(followUps)
      .where(and(eq(followUps.workspaceId, ctx.workspace.id), eq(followUps.id, followUpId)));
    if (!row) throw new Error(`Reminder ${followUpId} not found`);
    const hours = Math.floor(hoursOpen(row, ctx.clock));
    return { summary: row.status === "resolved" ? "answered" : `${hours}h · no response`, data: { hours, status: row.status } };
  },
});

export const checkPermissionTool = defineTool({
  name: "check_permission",
  description: "Ask the permission engine whether Navo may take an action on its own.",
  guard: "policy",
  input: z.object({ action: z.string().min(1), hoursSinceReminder: z.number().optional() }),
  summarizeArgs: ({ action }) => formatArgs({ action }),
  async run(_ctx, { action, hoursSinceReminder }) {
    const decision = checkPermission(action, { hoursSinceReminder });
    let summary = describeDecision(decision);
    if (action === "escalate_owner" && decision.decision === "allow") summary = "allowed after 24h · auto";
    if (action === "request_loaner") summary = "asset change · needs employee";
    return { summary, data: decision };
  },
});
