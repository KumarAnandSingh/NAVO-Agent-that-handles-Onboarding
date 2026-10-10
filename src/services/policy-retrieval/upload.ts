/**
 * HR adds or updates a policy: Navo splits the text into sections, gives each a citable
 * ref, versions the policy and makes it searchable at once (Ask Navo and the agent read the
 * same library). Uploads belong to one demo workspace, so one visitor's policy never changes
 * another's, and Reset removes them.
 *
 * Splitting rules, in order: Markdown headings, numbered headings ("4.2 Escalation",
 * "Section 3 Leave"), then plain paragraphs. Long sections are cut at sentence boundaries so each
 * stays focused for retrieval. Refs are always fresh (a new policy gets the next free
 * number, an update keeps its policy's number), so two sections never share a ref.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { refNumber } from "@/domain/policy-ref";
import { dateKeyOf } from "@/domain/time";
import type { Queryable } from "@/lib/db/client";
import { policyDocuments, policySections } from "@/lib/db/schema";
import { compareVersions, currentSections, loadSections, type PolicySection } from "./index";

export const MAX_POLICY_CHARS = 30_000;
const MAX_SECTIONS = 40;
const MAX_SECTION_CHARS = 1_200;
const TARGET_CHUNK_CHARS = 800;

export const PolicyUploadInput = z.object({
  title: z.string().trim().min(3, "Give the policy a title").max(120),
  category: z.string().trim().min(2).max(60).default("HR policy"),
  version: z.string().trim().regex(/^\d+(?:\.\d+){0,2}$/, "Use a version like 1.0 or 2.1"),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-12").optional(),
  /** The library policy this is a newer version of. */
  replaces: z.string().trim().min(1).max(80).optional(),
  text: z.string().trim().min(40, "Paste the policy text (at least a few sentences)").max(MAX_POLICY_CHARS),
});
export type PolicyUpload = z.input<typeof PolicyUploadInput>;

export class PolicyUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyUploadError";
  }
}

export interface ParsedSection {
  title: string;
  body: string;
}

const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const NUMBERED_HEADING = /^(?:(?:§|Section)\s*)?\d+(?:\.\d+)*[.)]?\s+(\S.{1,90})$/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function isNumberedHeading(line: string): string | null {
  const match = NUMBERED_HEADING.exec(line);
  // "1. Bring your PAN card." is a list item, not a heading.
  if (!match || /[.;:,]$/.test(line) || line.split(/\s+/).length > 12) return null;
  return clean(match[1]!);
}

/** Cut a long section at sentence boundaries into parts of about TARGET_CHUNK_CHARS. */
function chunk(section: ParsedSection): ParsedSection[] {
  if (section.body.length <= MAX_SECTION_CHARS) return [section];
  const sentences = section.body.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [section.body];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > TARGET_CHUNK_CHARS) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map((body, i) => ({ title: i === 0 ? section.title : `${section.title} (part ${i + 1})`, body }));
}

/** Split policy text into titled sections. Pure. Returns the document title if the text has one. */
export function splitPolicy(text: string): { title: string | null; sections: ParsedSection[] } {
  const source = text.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const lines = source.split("\n");
  let title: string | null = null;
  const sections: { title: string; lines: string[] }[] = [];
  const hasHeadings = lines.some((l) => MD_HEADING.test(l.trim()) || isNumberedHeading(l.trim()));

  if (hasHeadings) {
    let current: { title: string; lines: string[] } | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      const md = MD_HEADING.exec(line);
      if (md && md[1] === "#" && !title && sections.length === 0 && !current) {
        title = clean(md[2]!);
        continue;
      }
      const heading = md ? clean(md[2]!) : isNumberedHeading(line);
      if (heading) {
        current = { title: heading, lines: [] };
        sections.push(current);
      } else if (line) {
        if (!current) {
          current = { title: "Overview", lines: [] };
          sections.push(current);
        }
        current.lines.push(line.replace(/^[-*•]\s+/, ""));
      }
    }
  } else {
    // No headings: each paragraph is a section, titled by its opening words.
    for (const paragraph of source.split(/\n\s*\n/)) {
      const body = clean(paragraph);
      if (!body) continue;
      const words = body.replace(/[.:;,].*$/, "").split(" ").slice(0, 6).join(" ");
      sections.push({ title: words, lines: [body] });
    }
  }

  const parsed = sections
    .map((s) => ({ title: s.title.slice(0, 100), body: clean(s.lines.join(" ")) }))
    .filter((s) => s.body.length > 0)
    .flatMap(chunk);
  return { title, sections: parsed };
}

const majorOf = (ref: string) => Number(/Section (\d+)/.exec(ref)?.[1] ?? 0);

export interface PolicyPreview {
  documentId: string;
  title: string;
  version: string;
  effectiveDate: string;
  replaces: string | null;
  sections: { ref: string; title: string; body: string }[];
}

/** Parse and number an upload against the library in force, without saving it. */
export async function previewPolicy(db: Queryable, workspaceId: string, asOf: Date, upload: PolicyUpload): Promise<PolicyPreview> {
  const input = PolicyUploadInput.parse(upload);
  const { sections } = splitPolicy(input.text);
  if (sections.length === 0) throw new PolicyUploadError("Navo couldn't find any policy text to split into sections.");
  if (sections.length > MAX_SECTIONS) throw new PolicyUploadError(`That's ${sections.length} sections; split the policy into documents of at most ${MAX_SECTIONS}.`);

  const library = await loadSections(db, workspaceId);
  const inForce = currentSections(library, asOf);
  let major: number;
  if (input.replaces) {
    const family = library.filter((s) => (s.family ?? s.documentId) === input.replaces);
    if (family.length === 0) throw new PolicyUploadError("That policy isn't in the library.");
    const latest = family.reduce((a, b) => (compareVersions(b.version, a.version) > 0 ? b : a));
    if (compareVersions(input.version, latest.version) <= 0) throw new PolicyUploadError(`The new version must be higher than ${latest.version}.`);
    major = majorOf(latest.ref);
  } else {
    major = Math.max(0, ...library.map((s) => majorOf(s.ref))) + 1;
    if (inForce.some((s) => s.documentTitle.toLowerCase() === input.title.toLowerCase())) {
      throw new PolicyUploadError("A policy with that title is already in force. Choose it under \"Replaces\" to publish a new version.");
    }
  }

  return {
    documentId: input.replaces ? `${input.replaces}~${workspaceId}` : `hr-${randomUUID().slice(0, 8)}~${workspaceId}`,
    title: input.title,
    version: input.version,
    effectiveDate: input.effectiveDate ?? dateKeyOf(asOf),
    replaces: input.replaces ?? null,
    sections: sections.map((s, i) => ({ ref: `Section ${major}.${i + 1}`, title: s.title, body: s.body })),
  };
}

/** Save an upload. From now on search_policies (Ask Navo and the agent) can find and cite it. */
export async function publishPolicy(db: Queryable, workspaceId: string, asOf: Date, upload: PolicyUpload): Promise<PolicyPreview> {
  const preview = await previewPolicy(db, workspaceId, asOf, upload);
  const input = PolicyUploadInput.parse(upload);
  await db.insert(policyDocuments).values({
    id: preview.documentId,
    version: preview.version,
    title: preview.title,
    category: input.category,
    effectiveDate: preview.effectiveDate,
    workspaceId,
    replaces: preview.replaces,
    metadata: { source: "hr_upload" },
  });
  await db.insert(policySections).values(
    preview.sections.map((s) => ({ id: `${preview.documentId}@${preview.version}${s.ref}`, documentId: preview.documentId, version: preview.version, ...s })),
  );
  return preview;
}

export interface PolicyListItem {
  documentId: string;
  family: string;
  title: string;
  version: string;
  effectiveDate: string;
  refs: string;
  sections: number;
  source: "library" | "hr";
  status: "in force" | "scheduled" | "superseded";
}

/** The library as HR sees it: every policy version, and whether it is in force today. */
export async function listPolicies(db: Queryable, workspaceId: string, asOf: Date): Promise<PolicyListItem[]> {
  const all = await loadSections(db, workspaceId);
  const inForce = new Set(currentSections(all, asOf).map((s) => `${s.documentId}@${s.version}`));
  const today = dateKeyOf(asOf);
  const docs = new Map<string, PolicySection[]>();
  for (const s of all) docs.set(`${s.documentId}@${s.version}`, [...(docs.get(`${s.documentId}@${s.version}`) ?? []), s]);
  return [...docs.entries()]
    .map(([key, sections]) => {
      const first = sections[0]!;
      const refs = sections.map((s) => refNumber(s.ref)).sort(compareVersions);
      return {
        documentId: first.documentId,
        family: first.family ?? first.documentId,
        title: first.documentTitle,
        version: first.version,
        effectiveDate: first.effectiveDate,
        refs: refs.length > 1 ? `${refs[0]}–${refs.at(-1)}` : (refs[0] ?? ""),
        sections: sections.length,
        source: first.source ?? "library",
        status: inForce.has(key) ? ("in force" as const) : first.effectiveDate > today ? ("scheduled" as const) : ("superseded" as const),
      };
    })
    .sort((a, b) => compareVersions(a.refs.split("–")[0] ?? "0", b.refs.split("–")[0] ?? "0") || compareVersions(b.version, a.version));
}
