/**
 * Property-based tests: instead of a few hand-picked cases, fast-check generates hundreds
 * of random calendars, graphs, dates and texts and checks rules that must always hold.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { WHAT_IFS, applyWhatIf, assessJoiner, type JoinerGraph } from "@/domain/cohort";
import { CircularDependencyError, DependencyGraph } from "@/domain/dependency-engine";
import { riskRank } from "@/domain/risk-engine";
import {
  HALDEN_CALENDAR,
  addCalendarDays,
  addWorkingDays,
  atIst,
  dateKeyOf,
  isWorkingDay,
  leadTimeCompletion,
  nextWorkingDay,
  workingDaysBetween,
} from "@/domain/time";
import type { DependencyEdge, TaskNode } from "@/domain/types";
import { Vault } from "@/services/llm/guard";
import { blocks, node } from "./helpers";

/** Any day from 2026 to 2027. */
const dateKey = fc.integer({ min: 0, max: 729 }).map((d) => addCalendarDays("2026-01-01", d));
const time = fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
const RUNS = { numRuns: 300 };

describe("working-day calendar properties", () => {
  it("adding n working days lands on a working day with n - 1 working days strictly between", () => {
    fc.assert(
      fc.property(dateKey, fc.integer({ min: 0, max: 40 }), (start, n) => {
        const from = isWorkingDay(start) ? start : nextWorkingDay(start);
        const to = addWorkingDays(from, n);
        expect(isWorkingDay(to)).toBe(true);
        expect(workingDaysBetween(from, to)).toBe(Math.max(0, n - 1));
        expect(to >= from).toBe(true);
      }),
      RUNS,
    );
  });

  it("never schedules work on a weekend or a company holiday", () => {
    fc.assert(
      fc.property(dateKey, (day) => {
        const next = nextWorkingDay(day);
        const weekday = new Date(`${next}T00:00:00Z`).getUTCDay();
        expect(weekday === 0 || weekday === 6).toBe(false);
        expect(HALDEN_CALENDAR.holidays.has(next)).toBe(false);
        expect(next > day).toBe(true);
      }),
      RUNS,
    );
  });

  it("a lead time never finishes before it was requested, and longer leads never finish earlier", () => {
    fc.assert(
      fc.property(dateKey, time, fc.integer({ min: 0, max: 10 }), (day, at, lead) => {
        const requested = atIst(day, at);
        const done = leadTimeCompletion(requested, lead);
        expect(done.getTime()).toBeGreaterThanOrEqual(requested.getTime());
        expect(leadTimeCompletion(requested, lead + 1).getTime()).toBeGreaterThanOrEqual(done.getTime());
        expect(dateKeyOf(done) >= day).toBe(true);
      }),
      RUNS,
    );
  });
});

/** A random acyclic graph: edges only point from a lower index to a higher one. */
const dag = fc.integer({ min: 2, max: 9 }).chain((n) =>
  fc.record({
    tasks: fc.array(
      fc.record({ lead: fc.integer({ min: 0, max: 4 }), done: fc.boolean(), day1: fc.boolean(), owner: fc.constantFrom("hr" as const, "it" as const, "vendor" as const) }),
      { minLength: n, maxLength: n },
    ),
    edges: fc.uniqueArray(
      fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })).filter(([a, b]) => a < b),
      { maxLength: n * 2, selector: ([a, b]) => `${a}-${b}` },
    ),
  }),
);

function build({ tasks, edges }: { tasks: { lead: number; done: boolean; day1: boolean; owner: TaskNode["ownerType"] }[]; edges: [number, number][] }) {
  const nodes = tasks.map((t, i) =>
    node(`t${i}`, { leadWorkingDays: t.lead, requiredForDay1: t.day1, ownerType: t.owner, status: t.done ? "completed" : "blocked", completedAt: t.done ? atIst("2026-10-12", "10:00").toISOString() : null }),
  );
  const links: DependencyEdge[] = edges.map(([a, b]) => blocks(`t${a}`, `t${b}`));
  return { nodes, links, graph: new DependencyGraph(nodes, links) };
}

describe("dependency graph properties", () => {
  it("orders every prerequisite before the task that waits on it", () => {
    fc.assert(
      fc.property(dag, (spec) => {
        const { graph, links } = build(spec);
        const order = graph.topologicalOrder().map((t) => t.id);
        expect(order).toHaveLength(spec.tasks.length);
        for (const e of links) expect(order.indexOf(e.prerequisiteTaskId)).toBeLessThan(order.indexOf(e.dependentTaskId));
      }),
      RUNS,
    );
  });

  it("projects no task to finish before an unfinished prerequisite", () => {
    fc.assert(
      fc.property(dag, (spec) => {
        const { graph, links, nodes } = build(spec);
        const now = atIst("2026-10-15", "09:15");
        const projection = graph.projectCompletions(now);
        for (const e of links) {
          if (nodes.find((t) => t.id === e.prerequisiteTaskId)?.status === "completed") continue;
          if (nodes.find((t) => t.id === e.dependentTaskId)?.status === "completed") continue;
          expect(projection.get(e.dependentTaskId)!.getTime()).toBeGreaterThanOrEqual(projection.get(e.prerequisiteTaskId)!.getTime());
        }
        // The critical chain only ever names tasks the task actually waits on.
        for (const t of nodes) {
          const upstream = new Set(graph.upstream(t.id).map((u) => u.id));
          for (const c of graph.criticalChain(t.id, now)) expect(upstream.has(c.id)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("rejects any edge that closes a loop", () => {
    fc.assert(
      fc.property(
        dag.filter((s) => s.edges.length > 0),
        fc.nat(),
        (spec, pick) => {
          const { nodes, links } = build(spec);
          const [a, b] = spec.edges[pick % spec.edges.length]!;
          // b already (transitively) waits on a; making a wait on b closes a loop.
          expect(() => new DependencyGraph(nodes, [...links, blocks(`t${b}`, `t${a}`)])).toThrow(CircularDependencyError);
        },
      ),
      RUNS,
    );
  });
});

describe("cohort what-if properties", () => {
  it("slowing a team never makes anyone's Day 1 safer", () => {
    fc.assert(
      fc.property(dag, fc.constantFrom(...WHAT_IFS), fc.integer({ min: 0, max: 20 }), (spec, whatIf, daysOut) => {
        const { graph } = build(spec);
        const now = atIst("2026-10-15", "09:15");
        const joiner: JoinerGraph = { employeeId: "x", day1Start: atIst(addWorkingDays("2026-10-15", daysOut + 1), "09:00"), graph, etas: new Map() };
        const before = assessJoiner(joiner, now).level;
        const after = assessJoiner(applyWhatIf(joiner, whatIf), now).level;
        expect(riskRank(after)).toBeGreaterThanOrEqual(riskRank(before));
      }),
      RUNS,
    );
  });
});

describe("personal-data guard properties", () => {
  const digits = (n: number) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n }).map((d) => d.join(""));
  const pii = fc.oneof(
    digits(10).map((d) => `9${d.slice(1)}`),
    digits(12).map((d) => `${(Number(d[0]) % 8) + 2}${d.slice(1, 4)} ${d.slice(4, 8)} ${d.slice(8)}`),
    fc.tuple(fc.stringMatching(/^[A-Z]{5}$/), digits(4), fc.stringMatching(/^[A-Z]$/)).map(([a, d, z]) => `${a}${d}${z}`),
  );
  const filler = fc.stringMatching(/^[a-zA-Z ,.]{0,30}$/);

  it("puts the joiner's exact text back after masking, and sends no personal number", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, pii), { minLength: 1, maxLength: 5 }), filler, (parts, tail) => {
        const text = `${parts.map(([f, p]) => `${f} ${p} `).join("")}${tail}`;
        const vault = new Vault();
        const masked = vault.mask(text);
        for (const [, p] of parts) expect(masked).not.toContain(p);
        expect(masked).not.toMatch(/\d{6,}/);
        expect(vault.unmask(masked)).toBe(text);
        // Masking is deterministic: the same text always gives the same placeholders.
        expect(new Vault().mask(text)).toBe(masked);
      }),
      RUNS,
    );
  });
});
