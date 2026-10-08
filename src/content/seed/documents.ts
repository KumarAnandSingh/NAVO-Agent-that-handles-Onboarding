import type { ExtractedField } from "@/lib/db/schema";

export interface DocumentSeed {
  type: string;
  name: string;
  status: "needed" | "verified" | "under_review" | "clarify";
  note: string;
  maskedValue?: string;
  extracted?: ExtractedField[];
}

/** Anand's documents as Navo found them when he first opened the app (all synthetic). */
export const FEATURED_DOCUMENTS: readonly DocumentSeed[] = [
  { type: "pan", name: "PAN card", status: "verified", note: "Read · name matches", maskedValue: "•••••4821M" },
  { type: "aadhaar", name: "Aadhaar", status: "verified", note: "Read · DOB matches", maskedValue: "XXXX XXXX 3051" },
  { type: "degree", name: "Degree certificate", status: "under_review", note: "With verification vendor" },
  {
    type: "relieving_letter",
    name: "Relieving letter",
    status: "clarify",
    note: "Date unclear on page 2 · tap",
    extracted: [
      { name: "employee_name", value: "Anand Mehta", confidence: 0.97 },
      { name: "employer", value: "Northwind Freight Pvt. Ltd.", confidence: 0.95 },
      { name: "last_working_day", value: "", raw: "1? Oct 2026", confidence: 0.41 },
    ],
  },
  { type: "address_proof", name: "Address proof", status: "needed", note: "Not uploaded" },
  { type: "cancelled_cheque", name: "Cancelled cheque", status: "verified", note: "Pre-filled payroll", maskedValue: "HDFC Bank •••• 4821" },
];

export interface FormFieldSeed {
  form: string;
  label: string;
  value: string | null;
  source: string;
  status: "prefilled" | "needs_employee";
}

export const FEATURED_FORM_FIELDS: readonly FormFieldSeed[] = [
  { form: "personal", label: "Full name", value: "Anand Mehta", source: "From PAN", status: "prefilled" },
  { form: "personal", label: "Date of birth", value: "14 Mar 1991", source: "From Aadhaar", status: "prefilled" },
  { form: "personal", label: "Address", value: null, source: "From address proof", status: "prefilled" },
  { form: "personal", label: "Bank account", value: "HDFC •••• 4821", source: "From cheque", status: "prefilled" },
  { form: "nominee", label: "Nominee", value: "Kavya Mehta, spouse", source: "From offer form", status: "prefilled" },
  { form: "emergency", label: "Emergency contact", value: null, source: "Needs you", status: "needs_employee" },
];

/**
 * Synthetic sample documents a demo user can "upload". Images live in /public/samples
 * and are watermarked SYNTHETIC SAMPLE. `expected` is the reading used in offline mode
 * and as the regression baseline for the Claude reader.
 */
export interface SampleDocument {
  id: string;
  documentType: "address_proof" | "relieving_letter";
  label: string;
  file: string;
  expected: ExtractedField[];
}

export const SAMPLE_DOCUMENTS: readonly SampleDocument[] = [
  {
    id: "electricity-bill",
    documentType: "address_proof",
    label: "Electricity bill (Sep 2026)",
    file: "/samples/electricity-bill.png",
    expected: [
      { name: "document_kind", value: "Electricity bill", confidence: 0.98 },
      { name: "holder_name", value: "Anand Mehta", confidence: 0.97 },
      { name: "address", value: "14 Sea Breeze Apartments, Andheri West, Mumbai 400058", confidence: 0.94 },
      { name: "issue_date", value: "02 Sep 2026", confidence: 0.95 },
    ],
  },
  {
    id: "electricity-bill-other-name",
    documentType: "address_proof",
    label: "Electricity bill in another name",
    file: "/samples/electricity-bill-other-name.png",
    expected: [
      { name: "document_kind", value: "Electricity bill", confidence: 0.98 },
      { name: "holder_name", value: "Kavya Mehta", confidence: 0.96 },
      { name: "address", value: "14 Sea Breeze Apartments, Andheri West, Mumbai 400058", confidence: 0.94 },
      { name: "issue_date", value: "02 Sep 2026", confidence: 0.95 },
    ],
  },
  {
    id: "relieving-letter",
    documentType: "relieving_letter",
    label: "Relieving letter, page 2",
    file: "/samples/relieving-letter.png",
    expected: [
      { name: "employee_name", value: "Anand Mehta", confidence: 0.97 },
      { name: "employer", value: "Northwind Freight Pvt. Ltd.", confidence: 0.95 },
      { name: "last_working_day", value: "", raw: "1? Oct 2026", confidence: 0.41 },
    ],
  },
];
