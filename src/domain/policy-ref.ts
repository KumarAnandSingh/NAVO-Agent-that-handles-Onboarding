/** Halden policy sections are cited as "Section 4.2". These helpers format them for tight spaces. */

/** "Section 4.2" → "4.2", for columns already headed "Sections". */
export function refNumber(ref: string): string {
  return ref.replace(/^Section\s+/, "");
}

/** A run of refs in prose: "Section 9.1", or "Sections 9.1–9.4". */
export function refRange(refs: readonly string[]): string {
  if (refs.length === 0) return "";
  if (refs.length === 1) return refs[0]!;
  return `Sections ${refNumber(refs[0]!)}–${refNumber(refs[refs.length - 1]!)}`;
}
