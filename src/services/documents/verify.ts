/**
 * Deterministic checks applied to whatever a document reader extracted. The reader
 * (Claude or a fixture) only reads; these rules decide whether a document is verified,
 * needs one clarification, or must be re-uploaded.
 */
import { atIst, dateKeyOf, formatLongDate, isWorkingDay } from "@/domain/time";
import type { ExtractedField } from "@/lib/db/schema";

export const CONFIDENCE_THRESHOLD = 0.8;

export type Verdict =
  | { status: "verified"; note: string }
  | { status: "clarify"; note: string; field: string; raw: string; suggestion: string | null }
  | { status: "rejected"; note: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function field(fields: readonly ExtractedField[], name: string): ExtractedField | undefined {
  return fields.find((f) => f.name === name);
}

const normaliseName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

export function verifyAddressProof(fields: readonly ExtractedField[], employeeName: string): Verdict {
  const holder = field(fields, "holder_name");
  const address = field(fields, "address");
  if (!holder || !address || holder.confidence < CONFIDENCE_THRESHOLD || address.confidence < CONFIDENCE_THRESHOLD) {
    return { status: "rejected", note: "Couldn't read the name or address · re-upload" };
  }
  if (normaliseName(holder.value) !== normaliseName(employeeName)) {
    return { status: "rejected", note: `In the name of ${holder.value}, not you · re-upload` };
  }
  return { status: "verified", note: "Read · matches Aadhaar" };
}

export function verifyRelievingLetter(
  fields: readonly ExtractedField[],
  window: { notBefore: string; before: string },
): Verdict {
  const lastDay = field(fields, "last_working_day");
  if (!lastDay) return { status: "rejected", note: "No last working day found · re-upload" };
  const parsed = parseDate(lastDay.value);
  if (lastDay.confidence >= CONFIDENCE_THRESHOLD && parsed) {
    if (parsed >= window.before) return { status: "rejected", note: "Last day overlaps your start date · HR will review" };
    return { status: "verified", note: `Last day ${shortDate(parsed)} confirmed` };
  }
  const raw = lastDay.raw ?? lastDay.value;
  const suggestion = suggestDate(raw, window);
  return { status: "clarify", note: "Date unclear on page 2 · tap", field: "last_working_day", raw, suggestion };
}

/** Parse "17 Oct 2026" / "2026-10-17" into YYYY-MM-DD. */
export function parseDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const match = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/i.exec(text.trim());
  if (!match) return null;
  const month = MONTHS.indexOf((match[2] ?? "").toLowerCase());
  if (month < 0) return null;
  const day = Number(match[1]);
  const key = `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return dateKeyOf(atIst(key, "12:00")) === key ? key : null;
}

/**
 * Resolve an unreadable digit ("1? Oct 2026") from context: the candidate must be a real
 * working day after the offer was accepted and before Day 1; people usually leave on the
 * last working day before they join, so the latest candidate wins.
 */
export function suggestDate(raw: string, window: { notBefore: string; before: string }): string | null {
  if (!raw.includes("?")) return null;
  const candidates: string[] = [];
  for (let digit = 0; digit <= 9; digit++) {
    const parsed = parseDate(raw.replace("?", String(digit)));
    if (parsed && parsed >= window.notBefore && parsed < window.before && isWorkingDay(parsed)) candidates.push(parsed);
  }
  return candidates.sort().at(-1) ?? null;
}

export function shortDate(key: string): string {
  const parts = formatLongDate(atIst(key, "12:00")).split(" ");
  return `${parts[1]} ${parts[2]}`;
}

/** "16 Oct 2026" */
export function displayDate(key: string): string {
  const parts = formatLongDate(atIst(key, "12:00")).split(" ");
  return `${parts[1]} ${parts[2]} ${parts[3]}`;
}
