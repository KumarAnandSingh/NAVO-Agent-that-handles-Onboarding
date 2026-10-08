"use client";

import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import type { ViewModel } from "@/services/view-model/types";
import styles from "./home.module.css";

export function HomeScreen({ vm }: { vm: ViewModel }) {
  const { liveFace, liveStatus, replay, why, toggleWhy, go, setSheet, employee, ask, busy } = useNavo();
  const home = vm.home;
  const statusTone = liveStatus ? TONE.agent : TONE[home.status.tone];
  const statusText = liveStatus?.text ?? home.status.text;
  const budget = [
    { n: home.budget.needYou, label: "Need you", dot: "#E5484D", ring: false, risk: false },
    { n: home.budget.handling, label: "Navo handling", dot: "#2F5BEA", ring: Boolean(replay), risk: false },
    { n: home.budget.waiting, label: "Waiting on others", dot: "#D19A14", ring: false, risk: false },
    { n: home.budget.atRisk, label: "At risk", dot: home.budget.atRisk ? "#C2410C" : "#C9CFD9", ring: false, risk: home.budget.atRisk > 0 },
  ];

  return (
    <>
      <div className={styles.screen}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <NavoFace state={liveFace} size={34} />
            <span>Navo</span>
            <span className={styles.status} style={{ color: statusTone.ink, background: statusTone.bg }} role="status" aria-live="polite">
              {statusText}
            </span>
          </div>
          <span className={styles.avatar} aria-label={vm.employee.name}>
            {vm.employee.initials}
          </span>
        </div>

        <div className={styles.hello}>
          <span className={styles.greeting}>{home.greeting}</span>
          <h1 className={styles.headline}>{home.headline}</h1>
        </div>

        <div className={styles.budget}>
          {budget.map((b) => (
            <div
              key={b.label}
              className={styles.budgetCard}
              style={{ background: b.risk ? "#FFF7EB" : "#fff", boxShadow: b.ring ? "inset 0 0 0 1px rgba(56,189,248,.55)" : "none" }}
            >
              <span className={styles.budgetNumber} style={{ color: b.risk ? "#C2410C" : undefined }}>
                <span className={styles.dot} style={{ background: b.dot }} />
                {b.n}
              </span>
              <span className={styles.budgetLabel}>{b.label}</span>
            </div>
          ))}
        </div>

        {home.needs.map((need) => (
          <div key={need.id} className={styles.card} style={{ borderColor: need.kind === "approval" ? "#F2C9C4" : "#fff" }}>
            <span className={styles.youKicker}>
              <span className={styles.youDot} />
              YOU · {need.kicker}
            </span>
            <div className={styles.needRow}>
              <div className={styles.stack}>
                <div className={styles.needTitle}>{need.title}</div>
                <div className={styles.needMeta}>{need.meta}</div>
              </div>
              {need.kind === "training" && (
                <button className={styles.start} disabled={busy} onClick={() => employee({ action: "complete_training" }, "Training complete. I told IT to switch on your access.")}>
                  Start
                </button>
              )}
              {need.kind === "forms" && (
                <button className={styles.start} onClick={() => go("forms")}>
                  Review
                </button>
              )}
              {need.kind === "documents" && (
                <button className={styles.start} onClick={() => go("docs")}>
                  Open
                </button>
              )}
              {need.kind === "pickup" && (
                <button className={styles.start} onClick={() => go("confirm")}>
                  Confirm
                </button>
              )}
              {need.kind === "benefits" && (
                <button className={styles.start} onClick={() => go("benefits")}>
                  Review
                </button>
              )}
            </div>
            {need.kind === "approval" && need.approvalId && (
              <div className={styles.actions}>
                <button className={styles.start} disabled={busy} onClick={() => employee({ action: "decide_approval", approvalId: need.approvalId, decision: "approved" })}>
                  Approve
                </button>
                <button className={styles.ghost} disabled={busy} onClick={() => employee({ action: "decide_approval", approvalId: need.approvalId, decision: "declined" })}>
                  Not now
                </button>
              </div>
            )}
          </div>
        ))}

        {home.did.length > 0 && (
          <div className={styles.didCard}>
            <div className={styles.didHead}>
              <span>{home.didHead}</span>
              <button className={styles.textLink} onClick={() => setSheet("activity")}>
                Activity
              </button>
            </div>
            {home.did.map((row) => (
              <button key={row.id} className={`${styles.didRow} ${row.fresh ? styles.didRowFresh : ""}`} onClick={() => setSheet("activity")}>
                {row.icon === "done" ? (
                  <span className={styles.check} aria-hidden>
                    ✓
                  </span>
                ) : (
                  <NavoFace state={row.icon === "escalated" ? "concerned" : "acting"} size={22} decorative />
                )}
                <span className={styles.stack}>
                  <span className={styles.didTitle}>{row.title}</span>
                  <span className={styles.didResult}>{row.result}</span>
                </span>
                <span className={styles.didWhen} style={{ color: row.fresh ? "var(--accent)" : "var(--text-4)" }}>
                  {row.when}
                </span>
              </button>
            ))}
          </div>
        )}

        {home.watch && (
          <div className={styles.watch} style={{ background: home.watch.tone === "risk" ? "#FFF7EB" : "#fff" }}>
            <div className={styles.watchHead}>
              <span className={styles.watchKicker} style={{ color: home.watch.tone === "risk" ? "#B45309" : "#5B6474" }}>
                <NavoFace state={home.watch.face} size={26} decorative />
                {home.watch.kicker}
              </span>
              <span className={styles.watchLinks}>
                {home.whySteps.length > 0 && (
                  <button className={styles.textLink} onClick={toggleWhy} aria-expanded={why}>
                    {why ? "Hide" : "Why?"}
                  </button>
                )}
                <button className={styles.textLink} onClick={() => go("idtrack")}>
                  Details
                </button>
              </span>
            </div>
            <span className={styles.watchTitle}>{home.watch.title}</span>
            <span className={styles.watchBody}>{home.watch.body}</span>
            <span className={styles.watchFoot} style={{ color: TONE[home.watch.footTone].ink }}>
              {home.watch.foot}
            </span>
            {why && (
              <div className={styles.why}>
                {home.whySteps.map((step, i) => (
                  <div key={i} className={styles.whyRow}>
                    <span className={styles.whyPhase} style={{ color: TONE[step.tone].ink }}>
                      {step.phase}
                    </span>
                    <span>{step.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {home.readyForDay1 && (
          <button className={styles.ready} onClick={() => go("idcard")}>
            <NavoFace state="celebrating" size={30} decorative />
            <span className={styles.readyText}>
              <span className={styles.readyTitle}>Your Day 1 pickup is ready</span>
              <span className={styles.readySub}>ID card, laptop and kit at Building B</span>
            </span>
            <span style={{ color: "#13795B" }}>→</span>
          </button>
        )}

        <div className={styles.links}>
          <button className={styles.linkRow} onClick={() => go("docs")}>
            <span>Documents and forms</span>
            <span style={{ fontSize: 12, color: TONE[home.docsLink.tone].ink }}>{home.docsLink.label}</span>
          </button>
          <button className={styles.linkRow} onClick={() => go("culture")}>
            <span>Meet Halden</span>
            <span style={{ fontSize: 12, color: "#5B6474" }}>3 min</span>
          </button>
          <button className={styles.linkRow} onClick={() => go("updates")}>
            <span>Updates</span>
            <span style={{ fontSize: 12, color: "#5B6474" }}>{vm.updates.length}</span>
          </button>
          <button className={styles.linkRow} onClick={() => go("journey")}>
            <span>My journey</span>
            <span style={{ color: "#2F5BEA" }}>→</span>
          </button>
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.chip} onClick={() => ask("What if HR doesn't respond?")}>
          What if HR doesn&apos;t respond?
        </button>
        <button className={styles.askBar} onClick={() => setSheet("ask")}>
          Ask Navo
        </button>
      </div>
    </>
  );
}
