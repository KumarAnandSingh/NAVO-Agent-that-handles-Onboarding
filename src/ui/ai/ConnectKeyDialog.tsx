"use client";

import { useEffect, useId, useState } from "react";
import { CLAUDE_KEY_PATTERN } from "@/lib/claude-key";
import type { KeyCheck } from "@/services/llm/key-check";
import { keyHeaders, saveClaudeKey } from "@/ui/state/claude-key";
import s from "./ai.module.css";

type Check = { kind: "idle" } | { kind: "testing" } | { kind: "done"; result: KeyCheck };

/** Connect a visitor's own Claude key: test it (free), then keep it in this tab only. */
export function ConnectKeyDialog({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [key, setKey] = useState("");
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const titleId = useId();
  const inputId = useId();
  const trimmed = key.trim();
  const wellFormed = CLAUDE_KEY_PATTERN.test(trimmed);
  const passed = check.kind === "done" && check.result.ok;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function test() {
    setCheck({ kind: "testing" });
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: keyHeaders(trimmed) });
      setCheck({ kind: "done", result: (await response.json()) as KeyCheck });
    } catch {
      setCheck({ kind: "done", result: { ok: false, error: "Couldn't reach Navo's server. Try again." } });
    }
  }

  function connect() {
    if (!saveClaudeKey(trimmed)) {
      setCheck({ kind: "done", result: { ok: false, error: "This browser blocks session storage, so Navo can't keep the key for this tab." } });
      return;
    }
    onConnected();
    onClose();
  }

  return (
    <div className={s.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={s.dialogTitle}>
          Try Navo with live Claude
        </h2>
        <p className={s.lede}>
          This demo runs offline by default. Every AI feature has a rule-based fallback, so it works without a key. To watch Claude do the work, connect your own Anthropic API key.
        </p>
        <ul className={s.points}>
          <li>The key stays in this browser tab and is cleared when you close it.</li>
          <li>It goes only to this server, with your own requests, to call Claude for you. It is never stored or logged.</li>
          <li>Calls are billed to your key. A full demo run costs a few US cents at list price.</li>
          <li>Personal numbers are masked in chat, and each task uses the smallest model that does it well.</li>
        </ul>
        <label className={s.field} htmlFor={inputId}>
          Anthropic API key
          <input
            id={inputId}
            className={s.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setCheck({ kind: "idle" });
            }}
            autoFocus
          />
        </label>
        {check.kind === "done" && (
          <div className={`${s.result} ${check.result.ok ? s.ok : s.error}`} role="status">
            {check.result.ok
              ? `This key works. Models it can use: ${check.result.models
                  .filter((m) => m.available)
                  .map((m) => m.name)
                  .join(", ")}.`
              : check.result.error}
          </div>
        )}
        <div className={s.actions}>
          <button className={s.ghost} onClick={onClose}>
            Cancel
          </button>
          {passed ? (
            <button className={s.primary} onClick={connect}>
              Use this key
            </button>
          ) : (
            <button className={s.primary} onClick={test} disabled={!wellFormed || check.kind === "testing"}>
              {check.kind === "testing" ? "Testing…" : "Test connection"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
