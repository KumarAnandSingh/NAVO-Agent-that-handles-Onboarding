import { and, eq, isNull, or } from "drizzle-orm";
import { dateKeyOf } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { policyDocuments, policySections } from "@/lib/db/schema";
import { rankBm25 } from "./bm25";

export interface PolicySection {
  id: string;
  ref: string;
  title: string;
  body: string;
  documentId: string;
  documentTitle: string;
  version: string;
  effectiveDate: string;
  /** The policy this is a version of: an upload that replaces a library policy shares its family. */
  family?: string;
  /** "hr" for a policy HR uploaded in this workspace. */
  source?: "library" | "hr";
}

export interface PolicyHit extends PolicySection {
  score: number;
}

/** Minimum BM25 score for a section to count as relevant. Below it, Navo says it doesn't know. */
export const MIN_RELEVANCE = 1.2;

/**
 * Only the version of each policy in force on `asOf` is searchable: newer versions that
 * are not yet effective and older versions they supersede are both excluded.
 */
export function currentSections(sections: readonly PolicySection[], asOf: Date): PolicySection[] {
  const today = dateKeyOf(asOf);
  const familyOf = (s: PolicySection) => s.family ?? s.documentId;
  const inForce = new Map<string, { documentId: string; version: string }>();
  for (const section of sections) {
    if (section.effectiveDate > today) continue;
    const current = inForce.get(familyOf(section));
    if (!current || compareVersions(section.version, current.version) > 0) inForce.set(familyOf(section), { documentId: section.documentId, version: section.version });
  }
  return sections.filter((s) => {
    const current = inForce.get(familyOf(s));
    return current?.documentId === s.documentId && current.version === s.version;
  });
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function rankSections(sections: readonly PolicySection[], query: string, limit = 3, minScore = MIN_RELEVANCE): PolicyHit[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  return rankBm25(
    sections.map((s) => ({ id: s.id, text: `${s.title} ${s.title} ${s.documentTitle} ${s.body}` })),
    query,
  )
    .filter((r) => r.score >= minScore)
    .slice(0, limit)
    .flatMap((r) => {
      const section = byId.get(r.id);
      return section ? [{ ...section, score: Number(r.score.toFixed(3)) }] : [];
    });
}

/** The shared library plus, with a workspace, the policies HR uploaded there. */
export async function loadSections(db: Queryable, workspaceId?: string): Promise<PolicySection[]> {
  const rows = await db
    .select({
      id: policySections.id,
      ref: policySections.ref,
      title: policySections.title,
      body: policySections.body,
      documentId: policySections.documentId,
      version: policySections.version,
      documentTitle: policyDocuments.title,
      effectiveDate: policyDocuments.effectiveDate,
      replaces: policyDocuments.replaces,
      workspaceId: policyDocuments.workspaceId,
    })
    .from(policySections)
    .innerJoin(policyDocuments, and(eq(policySections.documentId, policyDocuments.id), eq(policySections.version, policyDocuments.version)))
    .where(workspaceId ? or(isNull(policyDocuments.workspaceId), eq(policyDocuments.workspaceId, workspaceId)) : isNull(policyDocuments.workspaceId));
  return rows.map(({ replaces, workspaceId: owner, ...section }) => ({
    ...section,
    family: replaces ?? section.documentId,
    source: owner ? ("hr" as const) : ("library" as const),
  }));
}

export async function searchPolicies(
  db: Queryable,
  query: string,
  options: { asOf: Date; workspaceId?: string; limit?: number; minScore?: number },
): Promise<PolicyHit[]> {
  const sections = currentSections(await loadSections(db, options.workspaceId), options.asOf);
  return rankSections(sections, query, options.limit ?? 3, options.minScore ?? MIN_RELEVANCE);
}

export async function getSectionByRef(db: Queryable, ref: string, asOf: Date, workspaceId?: string): Promise<PolicySection | null> {
  const sections = currentSections(await loadSections(db, workspaceId), asOf);
  return sections.find((s) => s.ref === ref) ?? null;
}
