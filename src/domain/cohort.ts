/**
 * Cohort risk radar: the same deterministic Day-1 risk engine, run across every joiner at
 * once, plus what-if scenarios ("what if IT takes two more working days?"). A scenario
 * changes a copy of each joiner's graph and the ETAs its owning systems committed to,
 * then re-runs the engine; real state is never touched. Pure: no I/O.
 */
import type { DependencyGraph } from "./dependency-engine";
import { assessRisk, riskRank } from "./risk-engine";
import { HALDEN_CALENDAR, addWorkingDays, atIst, dateKeyOf, istParts, type WorkingCalendar } from "./time";
import type { OwnerType, RiskLevel } from "./types";

export interface JoinerGraph {
  employeeId: string;
  day1Start: Date;
  graph: DependencyGraph;
  /** Completion dates committed by owning systems (IT tickets, vendor checks). */
  etas: ReadonlyMap<string, Date>;
}

export interface WhatIf {
  id: string;
  label: string;
  team: OwnerType | null;
  extraWorkingDays: number;
}

export const WHAT_IFS: readonly WhatIf[] = [
  { id: "today", label: "As things stand", team: null, extraWorkingDays: 0 },
  { id: "it_slow", label: "IT takes a week longer", team: "it", extraWorkingDays: 5 },
  { id: "hr_slow", label: "HR is 2 working days slower", team: "hr", extraWorkingDays: 2 },
  { id: "vendor_slow", label: "Background checks slip a week", team: "vendor", extraWorkingDays: 5 },
];

export interface JoinerRisk {
  employeeId: string;
  level: RiskLevel;
  /** The Day-1 task driving the risk, and who owns it. */
  driverTaskId: string | null;
  driverOwner: OwnerType | null;
  slackWorkingDays: number | null;
  willMiss: boolean;
}

function shift(date: Date, workingDays: number, calendar: WorkingCalendar): Date {
  const { hour, minute } = istParts(date);
  return atIst(addWorkingDays(dateKeyOf(date), workingDays, calendar), `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
}

/** A joiner's graph and ETAs as they would be if `whatIf.team` were slower. */
export function applyWhatIf(joiner: JoinerGraph, whatIf: WhatIf, calendar: WorkingCalendar = HALDEN_CALENDAR): JoinerGraph {
  const { team, extraWorkingDays: extra } = whatIf;
  if (!team || extra === 0) return joiner;
  const owned = new Set(joiner.graph.allTasks().filter((t) => t.ownerType === team && t.status !== "completed").map((t) => t.id));
  const graph = joiner.graph.withTasks((t) =>
    owned.has(t.id)
      ? {
          ...t,
          leadWorkingDays: t.leadWorkingDays > 0 ? t.leadWorkingDays + extra : 0,
          dueAt: t.leadWorkingDays === 0 && t.dueAt ? shift(new Date(t.dueAt), extra, calendar).toISOString() : t.dueAt,
        }
      : t,
  );
  const etas = new Map([...joiner.etas].map(([id, eta]) => [id, owned.has(id) ? shift(eta, extra, calendar) : eta]));
  return { ...joiner, graph, etas };
}

export function assessJoiner(joiner: JoinerGraph, now: Date, calendar: WorkingCalendar = HALDEN_CALENDAR): JoinerRisk {
  if (now.getTime() >= joiner.day1Start.getTime()) {
    return { employeeId: joiner.employeeId, level: "none", driverTaskId: null, driverOwner: null, slackWorkingDays: null, willMiss: false };
  }
  const report = assessRisk({ graph: joiner.graph, now, day1Start: joiner.day1Start, etas: joiner.etas, calendar });
  const driver = report.driver;
  return {
    employeeId: joiner.employeeId,
    level: report.day1Level,
    driverTaskId: driver?.taskId ?? null,
    driverOwner: driver ? joiner.graph.task(driver.taskId).ownerType : null,
    slackWorkingDays: driver?.slackWorkingDays ?? null,
    willMiss: driver?.willMiss ?? false,
  };
}

export interface CohortReport {
  whatIf: WhatIf;
  joiners: JoinerRisk[];
  /** Joiners per Day-1 risk level. */
  levels: Record<RiskLevel, number>;
  /** Teams whose tasks put at least one joiner's Day 1 at medium risk or worse, worst first. */
  bottlenecks: { team: OwnerType; joiners: number; worst: RiskLevel }[];
}

export function assessCohort(joiners: readonly JoinerGraph[], now: Date, whatIf: WhatIf = WHAT_IFS[0]!, calendar: WorkingCalendar = HALDEN_CALENDAR): CohortReport {
  const risks = joiners.map((j) => assessJoiner(applyWhatIf(j, whatIf, calendar), now, calendar));
  const levels: Record<RiskLevel, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of risks) levels[r.level]++;
  const teams = new Map<OwnerType, { joiners: number; worst: RiskLevel }>();
  for (const r of risks) {
    if (!r.driverOwner || riskRank(r.level) < riskRank("medium")) continue;
    const team = teams.get(r.driverOwner) ?? { joiners: 0, worst: "none" as RiskLevel };
    team.joiners++;
    if (riskRank(r.level) > riskRank(team.worst)) team.worst = r.level;
    teams.set(r.driverOwner, team);
  }
  const bottlenecks = [...teams.entries()]
    .map(([team, v]) => ({ team, ...v }))
    .sort((a, b) => riskRank(b.worst) - riskRank(a.worst) || b.joiners - a.joiners);
  return { whatIf, joiners: risks, levels, bottlenecks };
}
