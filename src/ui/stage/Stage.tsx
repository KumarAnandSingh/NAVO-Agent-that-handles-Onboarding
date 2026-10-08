"use client";

import { HrConsole } from "@/ui/hr/HrConsole";
import { Phone } from "@/ui/phone/Phone";
import { useNavo } from "@/ui/state/NavoStore";
import { PresenterPanel } from "./PresenterPanel";
import { RuntimePanel } from "./RuntimePanel";
import st from "./stage.module.css";

/** The demo stage: presenter controls, the joiner's phone (or Priya's HR console), Navo's runtime. */
export function Stage() {
  const { view } = useNavo();
  return (
    <main className={st.stage}>
      <PresenterPanel />
      {view === "hr" ? <HrConsole /> : <Phone />}
      <RuntimePanel />
    </main>
  );
}
