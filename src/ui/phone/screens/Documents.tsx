"use client";

import { useState } from "react";
import type { Tone, ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import p from "../phone.module.css";
import s from "./screens.module.css";

const PILL: Record<string, Tone> = { Verified: "done", "Under review": "wait", Clarify: "wait", Needed: "you", "Re-upload": "you" };

/** Toast after an upload: what Navo concluded, in its words. */
function uploadToast(vm: ViewModel): string {
  const address = vm.documents.items.find((d) => d.type === "address_proof");
  if (address?.state === "Verified") return "Read your address proof. It matches your Aadhaar.";
  return vm.documents.head;
}

function SampleImage({ file, className }: { file: string; className: string | undefined }) {
  // Layered over the striped placeholder, so a missing sample image still reads as a document.
  return <span className={className} style={{ backgroundImage: `url(${file}), repeating-linear-gradient(0deg,#fff 0 6px,#eef1f5 6px 7px)` }} aria-hidden />;
}

export function DocumentsScreen({ vm }: { vm: ViewModel }) {
  const { go, employee, busy } = useNavo();
  const [picking, setPicking] = useState(false);
  const docs = vm.documents;
  const reading = busy && picking;

  const runCta = () => {
    if (docs.cta.action === "upload_address") setPicking((open) => !open);
    else if (docs.cta.action === "clarify") go("clarify");
    else go(docs.cta.action === "forms" ? "forms" : "home");
  };
  const upload = async (sampleId: string) => {
    const next = await employee({ action: "upload_sample", sampleId }, uploadToast);
    if (next) setPicking(false);
  };

  return (
    <div className={p.screen}>
      <div className={p.kickerRow}>
        <NavoFace state={reading ? "thinking" : docs.face} size={42} />
        <span className={p.kicker} style={{ color: TONE[docs.kickerTone].ink }}>
          {reading ? "READING" : docs.kicker}
        </span>
      </div>
      <div className={p.titleBlock}>
        <h1 className={p.headline}>{docs.head}</h1>
        <p className={p.sub}>{docs.sub}</p>
      </div>
      <button className={p.primary} onClick={runCta} disabled={reading} aria-expanded={docs.cta.action === "upload_address" ? picking : undefined}>
        {reading ? "Reading your document…" : docs.cta.label}
      </button>
      {picking && docs.cta.action === "upload_address" && (
        <div className={s.samples}>
          <span className={p.rowNote}>Pick a synthetic sample to upload. Navo reads it like a real scan.</span>
          {docs.samples.map((sample) => (
            <button key={sample.id} className={s.sampleButton} disabled={busy} onClick={() => upload(sample.id)}>
              <SampleImage file={sample.file} className={s.sampleThumb} />
              <span>{sample.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className={p.list}>
        {docs.items.map((doc, i) => {
          const tone = TONE[PILL[doc.state] ?? "muted"];
          return (
            <button
              key={doc.type}
              className={`${p.row} ${i === docs.items.length - 1 ? p.rowLast : ""}`}
              onClick={doc.tappable ? () => go("clarify") : undefined}
              style={{ cursor: doc.tappable ? "pointer" : "default" }}
              tabIndex={doc.tappable ? 0 : -1}
            >
              <span className={p.stack2}>
                <span className={p.rowTitle}>{doc.name}</span>
                <span className={p.rowNote}>
                  {doc.note}
                  {doc.readBy === "claude" ? " · read by Claude" : ""}
                  {doc.tappable ? " · tap" : ""}
                </span>
              </span>
              <span className={p.pill} style={{ color: tone.ink, background: doc.state === "Under review" || doc.state === "Clarify" ? "#FEF3E2" : tone.bg }}>
                {doc.state}
              </span>
            </button>
          );
        })}
      </div>
      <button className={p.link} onClick={() => go("privacy")}>
        How I protect your documents →
      </button>
    </div>
  );
}

export function ClarifyScreen({ vm }: { vm: ViewModel }) {
  const { go, employee, busy } = useNavo();
  const clarify = vm.documents.clarify;
  const hrFirst = vm.employee.hrName.split(" ")[0] ?? "HR";

  if (!clarify) {
    return (
      <div className={p.screen}>
        <button className={p.back} onClick={() => go("docs")}>
          ‹ Documents
        </button>
        <NavoFace state="calm" size={42} />
        <h1 className={p.headline}>Nothing to clarify.</h1>
        <p className={p.sub}>Every date on your documents is confirmed.</p>
      </div>
    );
  }

  const confirm = async () => {
    if (!clarify.suggestion) return;
    const next = await employee({ action: "confirm_field", documentType: "relieving_letter", value: clarify.suggestion }, `Updated. ${hrFirst} in HR is notified.`);
    if (next) go("docs");
  };
  const reupload = () => employee({ action: "upload_sample", sampleId: "relieving-letter" }, (next) => (next.documents.clarify ? "Same scan, same smudge. Confirming the date is quicker." : null));

  return (
    <div className={p.screen}>
      <button className={p.back} onClick={() => go("docs")}>
        ‹ Documents
      </button>
      <div className={p.kickerRow}>
        <NavoFace state="needs" size={42} />
        <span className={p.kicker} style={{ color: "var(--risk-ink)" }}>
          NEEDS CLARIFICATION
        </span>
      </div>
      <div className={p.titleBlock}>
        <h1 className={p.headline}>I couldn&apos;t read your last working date.</h1>
        <p className={p.sub}>{clarify.documentName}, page 2. HR needs it to confirm there&apos;s no overlap with your start.</p>
      </div>
      <div className={s.docPreview}>
        <span className={s.docZoom}>
          <SampleImage file="/samples/relieving-letter.png" className={s.docImage} />
          <span className={s.docHighlight} aria-hidden />
        </span>
        <span className={p.muted} style={{ color: "var(--text-2)" }}>
          I read: &ldquo;Last working day: <b>{clarify.raw}</b>&rdquo;
        </span>
      </div>
      {clarify.suggestionLabel ? (
        <>
          <span className={s.question}>Is it {clarify.suggestionLabel}?</span>
          <div className={s.twoButtons}>
            <button className={p.primary} style={{ borderRadius: 12, padding: 13, fontSize: 14 }} disabled={busy} onClick={confirm}>
              Yes, {clarify.suggestionLabel.split(" ").slice(0, 2).join(" ")}
            </button>
            <button className={p.secondary} style={{ borderRadius: 12, padding: 13 }} disabled={busy} onClick={reupload}>
              Re-upload
            </button>
          </div>
        </>
      ) : (
        <button className={p.secondary} disabled={busy} onClick={reupload}>
          Re-upload
        </button>
      )}
      <div className={s.thenNavo}>
        <span className={s.thenKicker}>THEN NAVO</span>
        <span className={s.thenText}>Updates your record, tells {hrFirst} in HR, and marks the requirement met.</span>
      </div>
    </div>
  );
}

const SOURCE_STYLE: Record<string, { ink: string; bg: string }> = {
  you: { ink: "#C8372D", bg: "#FDECEC" },
  done: { ink: "#13795B", bg: "#E3F2EC" },
  agent: { ink: "#2F5BEA", bg: "#E8F1FF" },
};

export function FormsScreen({ vm }: { vm: ViewModel }) {
  const { go, employee, busy } = useNavo();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState("");
  const forms = vm.forms;
  const missing = forms.rows.find((r) => r.needsYou);

  const saveContact = async () => {
    const next = await employee({ action: "emergency_contact", value: contact.trim() });
    if (next) setEditing(false);
  };
  const submit = async () => {
    const next = await employee({ action: "submit_forms" }, "Forms sent to HR. I'll take it from here.");
    if (next) go("home");
  };

  return (
    <div className={p.screen} style={{ gap: 14 }}>
      <div className={p.kickerRow}>
        <NavoFace state="calm" size={42} />
        <span className={p.muted}>3 forms · 2 min</span>
      </div>
      <div className={p.titleBlock}>
        <h1 className={p.headline}>I&apos;ve filled these in from your documents.</h1>
        <p className={p.sub}>{forms.submitted ? "Submitted to HR." : forms.sub}</p>
      </div>
      <div className={p.list}>
        {forms.rows.map((row, i) => {
          const tag = SOURCE_STYLE[row.tone] ?? SOURCE_STYLE.agent!;
          return (
            <div key={row.label} className={`${s.formRow} ${i === forms.rows.length - 1 ? p.rowLast : ""}`}>
              <span className={p.stack2}>
                <span className={s.formLabel}>{row.label}</span>
                <span className={s.formValue} style={{ color: row.needsYou ? "var(--text-4)" : undefined }}>
                  {row.value}
                </span>
              </span>
              <span className={s.sourceTag} style={{ color: tag.ink, background: tag.bg }}>
                {row.source}
              </span>
            </div>
          );
        })}
      </div>
      {editing && missing && (
        <form
          className={p.stack2}
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (contact.trim().length >= 5) void saveContact();
          }}
        >
          <label className={s.fieldLabel} htmlFor="emergency-contact">
            {missing.label}
          </label>
          <input
            id="emergency-contact"
            className={s.input}
            value={contact}
            autoFocus
            maxLength={120}
            placeholder="Name · phone number"
            onChange={(e) => setContact(e.target.value)}
          />
          <button className={p.dark} type="submit" disabled={busy || contact.trim().length < 5}>
            Save
          </button>
        </form>
      )}
      {forms.submitted ? (
        <button className={`${p.primary} ${p.bottom}`} onClick={() => go("home")}>
          Back to home
        </button>
      ) : missing ? (
        !editing && (
          <button
            className={`${p.primary} ${p.bottom}`}
            onClick={() => {
              setContact("Kavya Mehta · +91 00000 11223");
              setEditing(true);
            }}
          >
            Add {missing.label.toLowerCase()}
          </button>
        )
      ) : (
        <button className={`${p.primary} ${p.bottom}`} disabled={busy} onClick={submit}>
          Confirm and submit
        </button>
      )}
    </div>
  );
}
