/**
 * The read-only tools Ask Navo can use. Each one runs through Navo's tool registry, so it
 * is validated, timed and audited like any agent action, then formats its result as
 * compact text for Claude. The joiner is fixed by the server: a question can never read
 * another person's onboarding.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AgentContext } from "@/agent/context";
import {
  calculateDay1Risk,
  getCalendar,
  getDependencies,
  getEmployeeContext,
  getFollowUps,
  getOnboardingState,
  searchPolicyLibrary,
} from "@/agent/tools";
import { callTool } from "@/agent/tools/registry";
import { TASK_KEYS } from "@/content/seed/onboarding-template";
import { formatDay, formatDayClock } from "@/domain/time";
import type { PolicyHit } from "@/services/policy-retrieval";
import { listPeople } from "@/services/onboarding-state/repository";

export interface AskToolOutput {
  /** What Claude reads. */
  content: string;
  /** What the joiner sees under the answer ("Checked your onboarding"). */
  checked?: string;
  /** Policy sections this call returned; only these may be cited. */
  sections?: PolicyHit[];
}

interface AskTool {
  spec: Anthropic.Tool;
  input: z.ZodType;
  run(ctx: AgentContext, input: unknown): Promise<AskToolOutput>;
}

const NO_INPUT = { type: "object" as const, properties: {}, additionalProperties: false };
const when = (d: Date | null | undefined) => (d ? formatDayClock(d) : "no date");

export const ASK_TOOLS: Record<string, AskTool> = {
  get_onboarding_state: {
    spec: {
      name: "get_onboarding_state",
      description: "The joiner's onboarding tasks with status, owner team, deadline, Day-1 risk and a short status note.",
      input_schema: NO_INPUT,
    },
    input: z.object({}),
    async run(ctx) {
      const result = await callTool(ctx, getOnboardingState, { employeeId: ctx.employeeId });
      const lines = result.data.map(
        (t) => `${t.key} | ${t.name} | ${t.status} | owner ${t.ownerType} | due ${t.dueAt ? formatDay(t.dueAt) : "-"} | risk ${t.riskLevel}${t.statusNote ? ` | ${t.statusNote}` : ""}`,
      );
      return { content: `key | name | status | owner | due | risk | note\n${lines.join("\n")}`, checked: "your onboarding" };
    },
  },
  get_dependencies: {
    spec: {
      name: "get_dependencies",
      description: "What a task waits on (upstream) and which Day-1 tasks wait on it (downstream). Use a task key from get_onboarding_state.",
      input_schema: {
        type: "object",
        properties: { task: { type: "string", enum: [...TASK_KEYS], description: "Task key, e.g. employee_id" } },
        required: ["task"],
        additionalProperties: false,
      },
    },
    input: z.object({ task: z.enum(TASK_KEYS) }),
    async run(ctx, input) {
      const { task } = input as { task: string };
      const result = await callTool(ctx, getDependencies, { taskId: `${ctx.employeeId}/${task}` });
      return { content: `waits on: ${result.data.upstream.join(", ") || "nothing"}\nDay-1 items waiting on it: ${result.data.downstream.join(", ") || "none"}`, checked: "what depends on it" };
    },
  },
  calculate_day1_risk: {
    spec: {
      name: "calculate_day1_risk",
      description: "Navo's Day-1 risk assessment: overall level, the task driving it, working days of slack and the last safe start.",
      input_schema: NO_INPUT,
    },
    input: z.object({}),
    async run(ctx) {
      const result = await callTool(ctx, calculateDay1Risk, { employeeId: ctx.employeeId });
      const { driver, driverLastSafeStart } = result.data;
      const extra = driver
        ? `\ndriver: ${driver.taskId.split("/")[1]} (${driver.level}${driver.willMiss ? ", will miss Day 1 at current dates" : ""})${driverLastSafeStart ? `\nlast safe start: ${when(driverLastSafeStart)}` : ""}`
        : "";
      return { content: `${result.summary}${extra}`, checked: "Day 1 risk" };
    },
  },
  get_follow_ups: {
    spec: {
      name: "get_follow_ups",
      description: "Reminders and escalations Navo has sent for this joiner, with reply windows, and approvals Navo asked the joiner for.",
      input_schema: NO_INPUT,
    },
    input: z.object({}),
    async run(ctx) {
      const result = await callTool(ctx, getFollowUps, { employeeId: ctx.employeeId });
      const people = await listPeople(ctx.db, ctx.workspace.id);
      const name = (id: string | null) => (id ? (people.get(id)?.name ?? id) : "");
      const sent = result.data.followUps.map(
        (f) => `${f.kind} ${f.id} to ${name(f.toPersonId)}${f.ccPersonId ? ` (cc ${name(f.ccPersonId)})` : ""} about ${f.taskId.split("/")[1]} | sent ${when(f.sentAt)} | reply due ${when(f.slaDueAt)} | ${f.status}`,
      );
      const asks = result.data.approvals.map((a) => `approval ${a.id}: ${a.title} | ${a.status}`);
      return { content: [...sent, ...asks].join("\n") || "No reminders, escalations or approvals yet.", checked: "Navo's follow-ups" };
    },
  },
  get_calendar: {
    spec: {
      name: "get_calendar",
      description: "The joiner's booked sessions with times and places (induction, pickup, 1:1s, trainings, check-ins).",
      input_schema: NO_INPUT,
    },
    input: z.object({}),
    async run(ctx) {
      const result = await callTool(ctx, getCalendar, { employeeId: ctx.employeeId });
      const lines = result.data.map((e) => `${when(e.startsAt)} | ${e.title} | ${e.location}`);
      return { content: lines.join("\n") || "Nothing booked yet.", checked: "your calendar" };
    },
  },
  get_employee_context: {
    spec: {
      name: "get_employee_context",
      description: "The joiner's profile: role, joining date, office, work mode, manager, buddy, HR owner and family details for benefits.",
      input_schema: NO_INPUT,
    },
    input: z.object({}),
    async run(ctx) {
      const result = await callTool(ctx, getEmployeeContext, { employeeId: ctx.employeeId });
      const e = result.data;
      const people = await listPeople(ctx.db, ctx.workspace.id);
      const family = e.family ? `${e.family.maritalStatus}, ${e.family.children} child${e.family.children === 1 ? "" : "ren"}` : "not shared";
      return {
        content: [
          `name: ${people.get(e.personId)?.name ?? e.personId}`,
          `role: ${e.role}`,
          `joins: ${e.joiningDate}`,
          `work mode: ${e.workMode}`,
          `manager: ${people.get(e.managerId)?.name ?? "-"}`,
          `buddy: ${e.buddyId ? (people.get(e.buddyId)?.name ?? "-") : "-"}`,
          `HR owner: ${people.get(e.hrOwnerId)?.name ?? "-"}`,
          `employee ID: ${e.employeeNumber ?? "not issued yet"}`,
          `family: ${family}`,
        ].join("\n"),
        checked: "your profile",
      };
    },
  },
  search_policies: {
    spec: {
      name: "search_policies",
      description: "Search Halden's current policy library. Returns matching sections with their refs (e.g. §4.2). Cite only refs returned here.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", description: "Keywords, e.g. 'health cover parents'" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
    input: z.object({ query: z.string().min(2).max(200) }),
    async run(ctx, input) {
      const { query } = input as { query: string };
      const result = await callTool(ctx, searchPolicyLibrary, { query, limit: 3 });
      const hits = result.data;
      const content = hits.length
        ? hits.map((h) => `${h.ref} ${h.title} (${h.documentTitle}, v${h.version}): ${h.body}`).join("\n\n")
        : "No relevant policy found.";
      return { content, sections: hits };
    },
  },
};

export const ASK_TOOL_SPECS: Anthropic.Tool[] = Object.values(ASK_TOOLS).map((t) => t.spec);
