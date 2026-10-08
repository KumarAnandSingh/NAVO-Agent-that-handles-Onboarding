import { and, eq } from "drizzle-orm";
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
  const inForce = new Map<string, string>();
  for (const section of sections) {
    if (section.effectiveDate > today) continue;
    const current = inForce.get(section.documentId);
    if (!current || compareVersions(section.version, current) > 0) inForce.set(section.documentId, section.version);
  }
  return sections.filter((s) => inForce.get(s.documentId) === s.version);
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

export async function loadSections(db: Queryable): Promise<PolicySection[]> {
  return db
    .select({
      id: policySections.id,
      ref: policySections.ref,
      title: policySections.title,
      body: policySections.body,
      documentId: policySections.documentId,
      version: policySections.version,
      documentTitle: policyDocuments.title,
      effectiveDate: policyDocuments.effectiveDate,
    })
    .from(policySections)
    .innerJoin(
      policyDocuments,
      and(eq(policySections.documentId, policyDocuments.id), eq(policySections.version, policyDocuments.version)),
    );
}

export async function searchPolicies(
  db: Queryable,
  query: string,
  options: { asOf: Date; limit?: number; minScore?: number },
): Promise<PolicyHit[]> {
  const sections = currentSections(await loadSections(db), options.asOf);
  return rankSections(sections, query, options.limit ?? 3, options.minScore ?? MIN_RELEVANCE);
}

export async function getSectionByRef(db: Queryable, ref: string, asOf: Date): Promise<PolicySection | null> {
  const sections = currentSections(await loadSections(db), asOf);
  return sections.find((s) => s.ref === ref) ?? null;
}
