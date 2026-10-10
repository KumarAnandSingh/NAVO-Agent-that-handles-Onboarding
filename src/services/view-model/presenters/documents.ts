/** Documents and forms. */
import { SAMPLE_DOCUMENTS } from "@/content/seed/documents";
import { TIMELINE } from "@/content/timeline";
import { displayDate, verifyRelievingLetter } from "@/services/documents/verify";
import type { DocumentsVM, FormsVM, Tone } from "../types";
import type { Ctx} from "./context";
import { done } from "./context";

export function presentDocuments(ctx: Ctx): DocumentsVM {
  const docs = ctx.state.documents;
  const stateOf = (status: string): { state: DocumentsVM["items"][number]["state"]; tone: Tone } => {
    switch (status) {
      case "verified":
        return { state: "Verified", tone: "done" };
      case "under_review":
        return { state: "Under review", tone: "wait" };
      case "clarify":
        return { state: "Clarify", tone: "wait" };
      case "rejected":
        return { state: "Re-upload", tone: "you" };
      default:
        return { state: "Needed", tone: "you" };
    }
  };
  const items = docs.map((d) => ({ type: d.type, name: d.name, note: d.note, ...stateOf(d.status), tappable: d.status === "clarify", readBy: d.readBy }));
  const address = docs.find((d) => d.type === "address_proof");
  const relieving = docs.find((d) => d.type === "relieving_letter");
  const allVerified = docs.every((d) => d.status === "verified" || d.status === "under_review");
  const formsDone = done(ctx.byKey.get("forms"));

  let clarify: DocumentsVM["clarify"] = null;
  if (relieving?.status === "clarify") {
    const verdict = verifyRelievingLetter(relieving.extracted, { notBefore: TIMELINE.offerAccepted, before: ctx.employee.joiningDate });
    if (verdict.status === "clarify") {
      clarify = {
        field: verdict.field,
        raw: verdict.raw,
        suggestion: verdict.suggestion,
        suggestionLabel: verdict.suggestion ? displayDate(verdict.suggestion) : null,
        documentName: relieving.name,
      };
    }
  }

  let view: Pick<DocumentsVM, "kicker" | "kickerTone" | "face" | "head" | "sub" | "cta">;
  if (address && (address.status === "needed" || address.status === "rejected")) {
    view =
      address.status === "rejected"
        ? { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "That bill isn't in your name.", sub: `${address.note.replace(" · re-upload", "")}. Upload one in your name and I'll finish today.`, cta: { label: "Upload another copy", action: "upload_address" } }
        : { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "Your address proof is missing.", sub: "Upload it and I can finish verification today. I've read everything else.", cta: { label: "Upload address proof", action: "upload_address" } };
  } else if (clarify) {
    view = { kicker: "NEXT BEST ACTION", kickerTone: "you", face: "needs", head: "One thing to clarify.", sub: "I couldn't read one date on your relieving letter.", cta: { label: "Clarify relieving letter", action: "clarify" } };
  } else {
    view = {
      kicker: "ALL VERIFIED",
      kickerTone: "done",
      face: "celebrating",
      head: "All documents verified.",
      sub: "HR has everything they need. Degree check is with the vendor.",
      cta: formsDone ? { label: "Back to home", action: "home" } : { label: "Continue to forms", action: "forms" },
    };
  }
  return {
    ...view,
    items,
    allVerified,
    clarify,
    samples: SAMPLE_DOCUMENTS.filter((s) => s.documentType === "address_proof").map((s) => ({ id: s.id, label: s.label, documentType: s.documentType, file: s.file })),
  };
}

export function presentForms(ctx: Ctx): FormsVM {
  const rows = ctx.state.formFields.map((f) => {
    const needsYou = f.status === "needs_employee" || !f.value;
    return {
      label: f.label,
      value: f.value ?? "Not provided",
      source: needsYou && f.status === "needs_employee" ? "Needs you" : f.source,
      tone: (needsYou ? "you" : f.status === "provided" ? "done" : "agent") as Tone,
      needsYou,
    };
  });
  const missing = rows.filter((r) => r.needsYou).length;
  return {
    sub: missing ? `Check them. Only ${missing} field${missing === 1 ? "" : "s"} need${missing === 1 ? "s" : ""} you.` : "All set. Check and submit.",
    rows,
    missing,
    submitted: done(ctx.byKey.get("forms")),
  };
}
