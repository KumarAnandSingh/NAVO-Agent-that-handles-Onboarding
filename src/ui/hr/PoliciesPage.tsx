"use client";

import { useId, useState } from "react";
import type { PolicyPreview } from "@/services/policy-retrieval/upload";
import type { HrVM } from "@/services/view-model/types";
import { keyHeaders } from "@/ui/state/claude-key";
import { useNavo } from "@/ui/state/NavoStore";
import h from "./hr.module.css";
import s from "./policies.module.css";

const SAMPLE = "/samples/policies/relocation-support.md";
const MAX_FILE_BYTES = 30_000;

type Result = { kind: "idle" } | { kind: "busy" } | { kind: "preview"; preview: PolicyPreview } | { kind: "published"; preview: PolicyPreview } | { kind: "error"; message: string };

async function post(body: unknown): Promise<{ preview?: PolicyPreview; published?: PolicyPreview; error?: string }> {
  const response = await fetch("/api/hr", { method: "POST", headers: { "content-type": "application/json", ...keyHeaders() }, body: JSON.stringify(body) });
  const json = (await response.json()) as { preview?: PolicyPreview; published?: PolicyPreview; error?: string };
  if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`);
  return json;
}

/** HR's policy library: what is in force, and adding or updating a policy Navo can cite. */
export function PoliciesPage({ policies }: { policies: HrVM["policies"] }) {
  const { refresh } = useNavo();
  const [replaces, setReplaces] = useState("");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [effectiveDate, setEffectiveDate] = useState(policies.today);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const ids = { replaces: useId(), title: useId(), version: useId(), date: useId(), text: useId(), file: useId() };

  const policy = { title, version, effectiveDate, text, category: "HR policy", ...(replaces ? { replaces } : {}) };
  const ready = title.trim().length >= 3 && text.trim().length >= 40 && result.kind !== "busy";

  function edit<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value);
      if (result.kind !== "busy") setResult({ kind: "idle" });
    };
  }

  function chooseReplaces(family: string) {
    edit(setReplaces)(family);
    const current = policies.replaceable.find((p) => p.family === family);
    if (current) {
      setTitle(current.title);
      const [major = "1", minor = "0"] = current.version.split(".");
      setVersion(`${major}.${Number(minor) + 1}`);
    } else {
      setVersion("1.0");
    }
  }

  async function loadSample() {
    const response = await fetch(SAMPLE);
    const sample = await response.text();
    setReplaces("");
    setTitle(/^#\s+(.+)$/m.exec(sample)?.[1] ?? "Relocation support");
    setVersion("1.0");
    setText(sample);
    setResult({ kind: "idle" });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setResult({ kind: "error", message: "That file is over 30 KB. Paste the part that matters, or split the policy." });
    const content = await file.text();
    setText(content);
    if (!title) setTitle(/^#\s+(.+)$/m.exec(content)?.[1] ?? file.name.replace(/\.(md|txt)$/i, ""));
    setResult({ kind: "idle" });
  }

  async function run(action: "preview_policy" | "publish_policy") {
    setResult({ kind: "busy" });
    try {
      const json = await post({ action, policy });
      if (action === "publish_policy" && json.published) {
        setResult({ kind: "published", preview: json.published });
        setText("");
        setTitle("");
        setReplaces("");
        await refresh();
      } else if (json.preview) setResult({ kind: "preview", preview: json.preview });
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  const shown = result.kind === "preview" || result.kind === "published" ? result.preview : null;
  const refs = shown ? `${shown.sections[0]?.ref}${shown.sections.length > 1 ? `–${shown.sections.at(-1)?.ref}` : ""}` : "";

  return (
    <div className={s.page}>
      <div className={s.intro}>
        <h1 className={h.title}>Policies and rules</h1>
        <p className={s.lede}>
          Navo answers and acts only from the policies in force on the day. Add or update a policy here and Navo can cite it straight away, in Ask Navo and in its own decisions.
        </p>
      </div>

      <div className={s.list} role="table" aria-label="Policy library">
        <div className={`${s.row} ${s.head}`} role="row">
          <span role="columnheader">Policy</span>
          <span role="columnheader">Version</span>
          <span role="columnheader">Sections</span>
          <span role="columnheader">Effective</span>
          <span role="columnheader">Status</span>
        </div>
        {policies.items.map((p) => (
          <div key={`${p.documentId}@${p.version}`} className={s.row} role="row">
            <span role="cell" className={s.policyTitle}>
              <span>{p.title}</span>
              {p.source === "hr" && <span className={s.badge}>Added by HR</span>}
            </span>
            <span role="cell">{p.version}</span>
            <span role="cell" className={s.muted}>
              {p.refs} · {p.sections}
            </span>
            <span role="cell" className={s.muted}>
              {p.effectiveDate}
            </span>
            <span role="cell" className={p.status === "in force" ? s.inForce : p.status === "scheduled" ? s.scheduled : s.muted}>
              {p.status === "in force" ? "In force" : p.status === "scheduled" ? "Scheduled" : "Superseded"}
            </span>
          </div>
        ))}
      </div>

      <section className={s.form} aria-labelledby={`${ids.title}-heading`}>
        <h2 id={`${ids.title}-heading`} className={s.formTitle}>
          Add or update a policy
        </h2>
        <div className={s.fields}>
          <label className={s.field} htmlFor={ids.replaces}>
            Replaces
            <select id={ids.replaces} className={s.select} value={replaces} onChange={(e) => chooseReplaces(e.target.value)}>
              <option value="">Nothing: a new policy</option>
              {policies.replaceable.map((p) => (
                <option key={p.family} value={p.family}>
                  {p.title} (v{p.version})
                </option>
              ))}
            </select>
          </label>
          <label className={s.field} htmlFor={ids.title}>
            Title
            <input id={ids.title} className={s.input} value={title} maxLength={120} onChange={(e) => edit(setTitle)(e.target.value)} />
          </label>
          <label className={s.field} htmlFor={ids.version}>
            Version
            <input id={ids.version} className={s.input} value={version} maxLength={12} onChange={(e) => edit(setVersion)(e.target.value)} />
          </label>
          <label className={s.field} htmlFor={ids.date}>
            Effective from
            <input id={ids.date} className={s.input} type="date" value={effectiveDate} onChange={(e) => edit(setEffectiveDate)(e.target.value)} />
          </label>
        </div>
        <label className={s.field} htmlFor={ids.text}>
          Policy text
          <span className={s.hint}>Paste text or Markdown. Headings become sections, each with a ref Navo can cite.</span>
          <textarea id={ids.text} className={s.textarea} value={text} onChange={(e) => edit(setText)(e.target.value)} spellCheck={false} />
        </label>
        <div className={s.actions}>
          <button className={s.secondary} onClick={loadSample} type="button">
            Load a sample policy
          </button>
          <label className={s.file} htmlFor={ids.file}>
            or upload a .md or .txt file{" "}
            <input id={ids.file} type="file" accept=".md,.txt,text/plain,text/markdown" onChange={(e) => void readFile(e.target.files?.[0])} />
          </label>
        </div>
        <div className={s.actions}>
          <button className={s.secondary} disabled={!ready} onClick={() => void run("preview_policy")} type="button">
            Preview sections
          </button>
          <button className={s.primary} disabled={!ready || result.kind !== "preview"} onClick={() => void run("publish_policy")} type="button">
            {result.kind === "busy" ? "Working…" : "Publish"}
          </button>
        </div>
        {result.kind === "error" && (
          <div className={`${s.note} ${s.error}`} role="alert">
            {result.message}
          </div>
        )}
        {result.kind === "published" && (
          <div className={`${s.note} ${s.ok}`} role="status">
            Published {result.preview.title} v{result.preview.version}. Navo can cite {refs} from now on.
          </div>
        )}
        {shown && (
          <ol className={s.preview} aria-label="Sections Navo found">
            {shown.sections.map((section) => (
              <li key={section.ref} className={s.previewItem}>
                <span className={s.ref}>{section.ref}</span>
                <span>
                  <span className={s.sectionTitle}>{section.title}</span> <span className={s.sectionBody}>{section.body}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
