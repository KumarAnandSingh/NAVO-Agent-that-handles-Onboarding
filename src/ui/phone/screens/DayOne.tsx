"use client";

import { useState } from "react";
import { COMPANY } from "@/content/company";
import type { ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import { TONE } from "@/ui/tones";
import p from "../phone.module.css";
import s from "./screens.module.css";

const OWNER_INK: Record<string, string> = { HR: "var(--owner-hr)", IT: "var(--owner-it)", FACILITIES: "var(--text-2)" };
const WHO_INK: Record<string, string> = { hr: "var(--owner-hr)", it: "var(--owner-it)", manager: "var(--owner-manager)", buddy: "var(--text-2)", you: "var(--you)" };

export function IdCardScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  const card = vm.day1.idCard;
  return (
    <div className={p.screen} style={{ gap: 18 }}>
      <button className={p.back} onClick={() => go("home")}>
        ‹ Home
      </button>
      <div className={p.kickerRow}>
        <NavoFace state="celebrating" size={42} />
        <span className={p.muted}>{card.readyNote ?? "Navo"}</span>
      </div>
      <h1 className={p.headline}>{card.ready ? "Your ID card is ready for collection." : "Your ID card is on its way."}</h1>
      <div className={s.idCard}>
        <span className={s.idPhoto} aria-hidden>
          {vm.employee.initials}
        </span>
        <div className={p.stack2} style={{ gap: 3 }}>
          <span style={{ fontSize: 11, color: "var(--signal-2)", fontWeight: 600, letterSpacing: "0.08em" }}>{COMPANY.name.toUpperCase()}</span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{vm.employee.name}</span>
          <span style={{ fontSize: 12, color: "var(--text-on-navy-2)" }}>{vm.employee.role}</span>
          <span style={{ fontSize: 12, color: "var(--text-on-navy-2)", fontFamily: "var(--font-mono)" }}>{card.number ?? "Number pending"}</span>
        </div>
      </div>
      <div className={p.list}>
        <div className={p.row} style={{ fontSize: 14 }}>
          <span>Generated</span>
          <span style={{ color: card.generated ? "var(--done)" : "var(--text-3)" }}>{card.generated ? `✓ ${card.generated}` : "Waiting on HR"}</span>
        </div>
        <div className={p.row} style={{ fontSize: 14 }}>
          <span>Ready for collection</span>
          <span style={{ color: card.ready ? "var(--done)" : "var(--text-3)" }}>{card.ready ? `✓ ${card.ready}` : "Printing"}</span>
        </div>
        <div className={`${p.row} ${p.rowLast}`} style={{ fontSize: 14 }}>
          <span>Collect</span>
          <span style={{ fontWeight: 600 }}>{card.collect}</span>
        </div>
      </div>
      <button className={`${p.primary} ${p.bottom}`} onClick={() => go("pickup")}>
        See everything for pickup
      </button>
    </div>
  );
}

export function PickupScreen({ vm }: { vm: ViewModel }) {
  const { go, demo, busy } = useNavo();
  const pickup = vm.day1.pickup;
  const skip = async () => {
    // Ready: move the clock and keep everything done so far. Not ready yet: replay the story to Day 1.
    const body = vm.chapter === "ready" ? { action: "skip", to: "day1" } : vm.chapter === "pre_joining" ? { action: "chapter", chapter: 4 } : null;
    if (body && !(await demo(body))) return;
    go("day1");
  };
  return (
    <div className={p.screen} style={{ gap: 18 }}>
      <button className={p.back} onClick={() => go("idcard")}>
        ‹ ID card
      </button>
      <NavoFace state="calm" size={56} />
      <div className={p.titleBlock}>
        <h1 className={p.headline}>{pickup ? "Everything's waiting for you in one place." : "I'm still lining up your pickup."}</h1>
        <p className={p.sub}>I coordinated HR, IT and Facilities so it&apos;s one trip.</p>
      </div>
      {pickup && (
        <>
          <div className={p.panel} style={{ borderRadius: 18, gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{pickup.site.replace(" · ", ", ")}</span>
            <span className={p.muted}>{pickup.window}</span>
          </div>
          <div className={p.list}>
            {pickup.items.map((item, i) => (
              <div key={item.key} className={p.row} style={{ gridTemplateColumns: "1fr auto auto", padding: "12px 0", borderBottom: i === pickup.items.length - 1 ? "none" : undefined }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: OWNER_INK[item.owner] }}>{item.owner}</span>
                <span style={{ fontSize: 12, color: item.ready ? "var(--done)" : "var(--text-3)" }}>{item.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <button className={`${p.primary} ${p.bottom}`} disabled={busy} onClick={skip}>
        Skip to {vm.employee.day1.split(" ")[0] === "Mon" ? "Monday" : "Day 1"} ▸
      </button>
    </div>
  );
}

export function DayOneScreen({ vm }: { vm: ViewModel }) {
  const { go, demo, busy } = useNavo();
  const day1 = vm.day1;
  const arrive = async () => {
    // Arriving for the pickup moves the clock to the pickup slot, so Navo sees the morning happen.
    if (!day1.collected && !(await demo({ action: "skip", to: "pickup" }))) return;
    go(day1.collected ? "day1done" : "confirm");
  };
  return (
    <div className={p.screen}>
      <NavoFace state="calm" size={50} />
      <div className={p.titleBlock} style={{ gap: 6 }}>
        <span className={p.muted} style={{ fontSize: 14 }}>
          Good morning, {vm.employee.firstName}.
        </span>
        <h1 className={p.headline}>Today is Day 1. I&apos;ve got the plan.</h1>
        <p className={p.sub}>{day1.travelTip}</p>
      </div>
      <div className={p.list}>
        {day1.schedule.map((item, i) => (
          <div key={`${item.time}-${item.what}`} className={`${s.scheduleRow} ${item.current ? s.scheduleNow : ""}`} style={{ borderBottom: i === day1.schedule.length - 1 ? "none" : undefined }}>
            <span style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{item.time}</span>
            <span className={p.stack2} style={{ gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{item.what}</span>
              <span className={p.rowNote}>{item.where}</span>
            </span>
            <span className={s.whoTag} style={{ color: WHO_INK[item.tone] }}>
              {item.who}
            </span>
          </div>
        ))}
      </div>
      <div className={p.panel} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14 }}>
        <NavoFace state="watching" size={24} decorative />
        <span style={{ fontSize: 13, lineHeight: 1.4 }}>I&apos;ll remind you as each one comes up. Bring PAN and one photo ID.</span>
      </div>
      <button className={`${p.primary} ${p.bottom}`} disabled={busy} onClick={arrive}>
        {day1.collected ? "See today's summary" : `I'm at ${COMPANY.pickupSite.split(" · ").pop()}`}
      </button>
    </div>
  );
}

export function ConfirmScreen({ vm }: { vm: ViewModel }) {
  const { go, employee, demo, busy } = useNavo();
  const [got, setGot] = useState<Record<string, boolean>>({});
  const items = vm.day1.pickup?.items ?? [
    { key: "id" as const, name: "Employee ID card" },
    { key: "laptop" as const, name: vm.day1.loaner ? "Loaner laptop" : "Laptop" },
    { key: "kit" as const, name: "Onboarding kit" },
  ];
  const picked = items.filter((item) => got[item.key]).map((item) => item.key);
  const confirm = async () => {
    if (!picked.length) return;
    const next = await employee({ action: "confirm_pickup", collected: picked }, picked.length === items.length ? "Closed your pickup requests with HR and IT." : "Closed what you collected. I'll sort the rest.");
    // Then let the rest of Day 1 happen (1:1, buddy) before the end-of-day summary.
    if (next && (await demo({ action: "skip", to: "day1_end" }))) go("day1done");
  };
  return (
    <div className={p.screen} style={{ gap: 18 }}>
      <button className={p.back} onClick={() => go("day1")}>
        ‹ Day 1
      </button>
      <NavoFace state="needs" size={50} />
      <div className={p.titleBlock}>
        <h1 className={p.headline}>Did you get everything?</h1>
        <p className={p.sub}>Tap what you collected. I&apos;ll close the requests with HR and IT.</p>
      </div>
      <div className={p.stack2} style={{ gap: 8 }}>
        {items.map((item) => {
          const on = Boolean(got[item.key]);
          return (
            <button key={item.key} className={`${s.toggle} ${on ? s.toggleOn : ""}`} aria-pressed={on} onClick={() => setGot((g) => ({ ...g, [item.key]: !g[item.key] }))}>
              <span>{item.name}</span>
              <span className={`${s.tick} ${on ? s.tickOn : ""}`}>{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <span className={p.muted}>Anything not ticked, I&apos;ll sort with the team that owns it.</span>
      <button className={`${p.primary} ${p.bottom}`} disabled={busy || picked.length === 0 || vm.day1.collected} onClick={confirm}>
        {vm.day1.collected ? "Already confirmed" : picked.length ? `Confirm ${picked.length} item${picked.length > 1 ? "s" : ""}` : "Tap what you collected"}
      </button>
    </div>
  );
}

export function DayOneDoneScreen({ vm }: { vm: ViewModel }) {
  const { go, demo, busy } = useNavo();
  const skip = async () => {
    if (vm.chapter !== "week1" && !(await demo({ action: "skip", to: "week1" }))) return;
    go("week1");
  };
  return (
    <div className={`${p.screen} ${s.celebrate}`} style={{ gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
        <NavoFace state="celebrating" size={92} />
      </div>
      <div className={p.titleBlock} style={{ textAlign: "center" }}>
        <h1 className={p.headline}>Day 1 done. Welcome to {COMPANY.name}.</h1>
        <p className={p.sub}>Everything from today is closed out.</p>
      </div>
      <div className={p.list}>
        {vm.day1.wrapUp.map((row, i) => (
          <div key={row.name} className={p.row} style={{ fontSize: 14, borderBottom: i === vm.day1.wrapUp.length - 1 ? "none" : undefined }}>
            <span>{row.name}</span>
            <span style={{ fontSize: 12, color: TONE[row.tone].ink }}>{row.status}</span>
          </div>
        ))}
      </div>
      {vm.day1.tomorrow && (
        <div className={p.panel}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Tomorrow</span>
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>{vm.day1.tomorrow}</span>
        </div>
      )}
      <button className={`${p.primary} ${p.bottom}`} disabled={busy} onClick={skip}>
        Skip to Week 1 ▸
      </button>
    </div>
  );
}
