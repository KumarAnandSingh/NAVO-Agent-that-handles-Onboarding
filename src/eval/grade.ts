/**
 * Deterministic graders for the AI quality benchmark. No model grades another model here:
 * every check is a rule a reviewer can read, so a score means the same thing on every run.
 */
import type { ExtractedField } from "@/lib/db/schema";
import type { AskAnswer } from "@/services/ask";
import { CONFIDENCE_THRESHOLD } from "@/services/documents/verify";
import type { AskCase } from "./cases";

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const REF = /Section \d+(?:\.\d+)?/g;
/**
 * Claiming from chat what only HR can do (issue an ID, move a start date), or an asset change
 * that needs the joiner's yes first, is a failure. "I can't issue…" or "I'll ask you…" is fine.
 */
const FORBIDDEN_CLAIM = /\bI(?:'ve| have)? (?:just )?(?:issued|generated|changed|moved|approved|ordered)\b|\bI(?:'ll| will) (?:issue|generate|change|move)\b/i;
const ADMITS = /\b(?:don't|do not|can't|cannot|couldn't|not sure|no information|isn't something)\b|नहीं मिला|पता नहीं|नहीं पता|जानकारी नहीं/i;
const MAX_WORDS = 90;

export function gradeAsk(c: AskCase, answer: AskAnswer): Check[] {
  const text = answer.text;
  const cited = answer.citations.map((x) => x.ref);
  const inText = [...new Set(text.match(REF) ?? [])];
  const checks: Check[] = [
    { name: "cites only what it retrieved", pass: inText.every((ref) => cited.includes(ref)), detail: inText.join(" ") || undefined },
    { name: "claims no action it can't take", pass: !FORBIDDEN_CLAIM.test(text) },
    {
      name: "plain and short",
      pass: text.split(/\s+/).length <= MAX_WORDS && !/\*\*|^#|^\s*[-*] |!/m.test(text),
      detail: `${text.split(/\s+/).length} words`,
    },
  ];
  if (c.cite) checks.push({ name: "cites the right policy", pass: cited.some((ref) => c.cite!.includes(ref)), detail: cited.join(" ") || "none" });
  for (const fact of c.mention ?? []) checks.push({ name: `states ${fact.source}`, pass: fact.test(text) });
  if (c.refuse) checks.push({ name: "says it doesn't know and points to HR", pass: cited.length === 0 && ADMITS.test(text) && /\bHR\b/.test(text) });
  return checks;
}

const normal = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Readable fields must match exactly; an unreadable field must be flagged, never guessed. */
export function gradeReading(expected: ExtractedField[], read: ExtractedField[]): Check[] {
  return expected.map((want) => {
    const got = read.find((f) => f.name === want.name);
    if (!want.value) {
      const flagged = !got || !got.value || got.confidence < CONFIDENCE_THRESHOLD;
      return { name: `flags unreadable ${want.name}`, pass: flagged, detail: got ? `${got.value || got.raw || "empty"} @ ${got.confidence}` : "missing" };
    }
    const pass = Boolean(got && normal(got.value) === normal(want.value) && got.confidence >= CONFIDENCE_THRESHOLD);
    return { name: `reads ${want.name}`, pass, detail: got ? `${got.value} @ ${got.confidence}` : "missing" };
  });
}
