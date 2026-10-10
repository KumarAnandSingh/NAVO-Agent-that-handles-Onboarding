/**
 * Presents the cohort radar: every joiner's Day-1 risk from the real risk engine, the
 * teams driving it, and how each what-if scenario would change it. Pure.
 */
import type { CohortReport, JoinerRisk } from "@/domain/cohort";
import { atIst, formatDay } from "@/domain/time";
import type { RiskLevel } from "@/domain/types";
import type { RadarVM, Tone } from "./types";

const LEVEL: Record<RiskLevel, { label: string; tone: Tone }> = {
  critical: { label: "Will miss Day 1", tone: "you" },
  high: { label: "At risk", tone: "risk" },
  medium: { label: "Watching", tone: "wait" },
  low: { label: "On track", tone: "done" },
  none: { label: "On track", tone: "done" },
};
const ORDER: RiskLevel[] = ["critical", "high", "medium", "low", "none"];
const TEAM: Record<string, string> = { employee: "Joiner", hr: "HR", hr_ops: "HR Ops", it: "IT", facilities: "Facilities", vendor: "Vendor", manager: "Manager", buddy: "Buddy", navo: "Navo" };

interface RadarInput {
  reports: CohortReport[];
  names: ReadonlyMap<string, string>;
  joiners: readonly { personId: string; role: string; joiningDate: string }[];
  taskNames: ReadonlyMap<string, string>;
}

const atRisk = (r: JoinerRisk) => r.level === "high" || r.level === "critical";

export function presentRadar({ reports, names, joiners, taskNames }: RadarInput): RadarVM {
  const baseline = new Map((reports[0]?.joiners ?? []).map((j) => [j.employeeId, j.level]));
  const scenarios = reports.map((report) => {
    const rows = report.joiners
      .map((r) => {
        const joiner = joiners.find((j) => j.personId === r.employeeId);
        const driver = r.driverTaskId
          ? [taskNames.get(r.driverTaskId) ?? r.driverTaskId, TEAM[r.driverOwner ?? ""] ?? r.driverOwner, r.slackWorkingDays === null ? null : r.willMiss ? "misses Day 1" : `${r.slackWorkingDays} working day${r.slackWorkingDays === 1 ? "" : "s"} of slack`]
              .filter(Boolean)
              .join(" · ")
          : "Nothing on the critical path";
        return {
          id: r.employeeId,
          name: names.get(r.employeeId) ?? r.employeeId,
          role: joiner?.role ?? "",
          start: joiner ? formatDay(atIst(joiner.joiningDate, "09:00")) : "",
          joiningDate: joiner?.joiningDate ?? "",
          level: r.level,
          label: LEVEL[r.level].label,
          tone: LEVEL[r.level].tone,
          driver,
          // Low and none both read "On track": only a change the reader can see counts.
          changed: LEVEL[baseline.get(r.employeeId) ?? "none"].label !== LEVEL[r.level].label,
        };
      })
      .sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.joiningDate.localeCompare(b.joiningDate))
      .map(({ joiningDate: _, ...row }) => row);
    const risky = report.joiners.filter(atRisk);
    const top = report.bottlenecks[0];
    const watch = report.levels.medium ? `; ${report.levels.medium} to watch` : "";
    const summary =
      risky.length === 0
        ? `${report.whatIf.team ? "Every Day 1 still holds" : "No Day 1 at risk"}${watch}.`
        : `${risky.length} joiner${risky.length === 1 ? "" : "s"} at risk of a broken Day 1${top ? `; ${TEAM[top.team] ?? top.team} drives ${top.joiners === risky.length && risky.length > 1 ? "all of them" : top.joiners}` : ""}.`;
    return {
      id: report.whatIf.id,
      label: report.whatIf.label,
      summary,
      levels: ORDER.filter((l) => l !== "none").map((level) => ({
        level,
        label: level === "low" ? "On track" : LEVEL[level].label,
        count: level === "low" ? report.levels.low + report.levels.none : report.levels[level],
        tone: LEVEL[level].tone,
      })),
      bottlenecks: report.bottlenecks.map((b) => ({ team: TEAM[b.team] ?? b.team, joiners: b.joiners, worst: LEVEL[b.worst].label, tone: LEVEL[b.worst].tone })),
      joiners: rows,
    };
  });
  return { scenarios };
}
