"use client";

import { useEffect } from "react";
import { COMPANY } from "@/content/company";
import type { ViewModel } from "@/services/view-model/types";
import { NavoFace } from "@/ui/components/NavoFace";
import { useNavo } from "@/ui/state/NavoStore";
import p from "../phone.module.css";
import s from "./screens.module.css";

const LAUNCH_MS = 1800;

export function LaunchScreen() {
  const { go } = useNavo();
  useEffect(() => {
    const timer = setTimeout(() => go("signin"), LAUNCH_MS);
    return () => clearTimeout(timer);
  }, [go]);
  return (
    <button className={s.launch} onClick={() => go("signin")} aria-label={`Open ${COMPANY.product}`}>
      <NavoFace state="brand" size={128} />
      <span className={`${p.titleBlock} ${s.launchTitle}`}>
        <span className={s.launchName}>{COMPANY.product}</span>
        <span className={s.launchTag}>{COMPANY.tagline}</span>
      </span>
      <span className={s.launchBy}>by {COMPANY.name}</span>
    </button>
  );
}

export function SignInScreen() {
  const { go } = useNavo();
  return (
    <div className={s.signin}>
      <NavoFace state="watching" size={52} />
      <div className={p.titleBlock}>
        <h1 className={p.headlineLg}>Welcome to {COMPANY.name}.</h1>
        <p className={p.subLg}>Sign in with the mobile number from your application. I&apos;ll set up your {COMPANY.name} account before Day 1.</p>
      </div>
      <div className={s.fieldGroup}>
        <span className={s.fieldLabel}>Mobile number</span>
        <div className={s.field}>
          <span className={s.countryCode}>+91</span>
          <span>••••• •1276</span>
        </div>
      </div>
      <div className={s.fieldGroup}>
        <span className={s.fieldLabel}>Code sent by SMS</span>
        <div className={s.otp}>
          {"481207".split("").map((digit, i) => (
            <span key={i} className={s.otpBox}>
              {digit}
            </span>
          ))}
        </div>
      </div>
      <button className={`${p.primary} ${p.bottom}`} onClick={() => go("meet")}>
        Continue
      </button>
      <span className={s.center}>Already at {COMPANY.name}? Sign in with {COMPANY.name} SSO</span>
    </div>
  );
}

export function MeetScreen() {
  const { go } = useNavo();
  return (
    <div className={s.meet}>
      <NavoFace state="calm" size={76} />
      <div className={p.titleBlock}>
        <h1 className={p.headlineLg}>Meet {COMPANY.product}, your AI onboarding agent.</h1>
        <p className={p.subLg}>
          I keep track of your onboarding, coordinate tasks across HR, IT and your manager, catch blockers early, and only ask you to step in when needed.
        </p>
      </div>
      <div className={p.list}>
        <div className={s.ruleRow}>
          <NavoFace state="acting" size={22} decorative />
          <span className={p.stack2}>
            <span className={s.ruleTitle}>I&apos;ll do on my own</span>
            <span className={s.ruleText}>Follow up with teams, raise requests, book meetings, track deadlines</span>
          </span>
        </div>
        <div className={s.ruleRow}>
          <span className={s.redDot} />
          <span className={p.stack2}>
            <span className={s.ruleTitle}>I&apos;ll always ask you first</span>
            <span className={s.ruleText}>Personal data, bank details, equipment changes</span>
          </span>
        </div>
        <div className={s.ruleRow}>
          <span className={s.greenCheck}>✓</span>
          <span className={p.stack2}>
            <span className={s.ruleTitle}>You can always see</span>
            <span className={s.ruleText}>What I did, when and why. Undo where possible.</span>
          </span>
        </div>
      </div>
      <button className={`${p.primary} ${p.bottom}`} onClick={() => go("docs")}>
        Sounds good. Let&apos;s start.
      </button>
    </div>
  );
}

export function PrivacyScreen({ vm }: { vm: ViewModel }) {
  const { go } = useNavo();
  const rows = [
    ["Encrypted", `In transit and at rest, in ${COMPANY.name}'s HR systems`],
    ["Access controlled", `Only ${vm.employee.hrName} (HR) and the verification vendor`],
    ["Retention by policy", "Kept as policy requires, then deleted"],
    ["Every access is logged", "You can see who viewed what, and when"],
  ];
  return (
    <div className={`${p.screen} ${s.detailScreen}`}>
      <button className={p.back} onClick={() => go("docs")}>
        ‹ Documents
      </button>
      <NavoFace state="calm" size={56} />
      <div className={p.titleBlock}>
        <h1 className={p.headline}>How I handle your documents</h1>
        <p className={p.sub}>I only use them for your onboarding.</p>
      </div>
      <div className={p.list}>
        {rows.map(([title, text], i) => (
          <div key={title} className={`${s.ruleRow} ${s.privacyRow} ${i === rows.length - 1 ? p.rowLast : ""}`}>
            <span className={s.privacyText}>
              <span className={s.ruleTitle}>{title}</span>
              <span className={s.ruleText}>{text}</span>
            </span>
          </div>
        ))}
      </div>
      <span className={`${p.bottom} ${s.disclaimer}`}>{COMPANY.disclaimer}</span>
    </div>
  );
}
