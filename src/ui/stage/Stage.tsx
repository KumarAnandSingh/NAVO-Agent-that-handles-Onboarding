"use client";

import { HrConsole } from "@/ui/hr/HrConsole";
import { Phone } from "@/ui/phone/Phone";
import { useNavo } from "@/ui/state/NavoStore";
import { ImpactOutro, IntroBrief } from "./Briefs";
import { CaptionBar, GuideProvider, useGuide } from "./Guide";
import { PresenterPanel } from "./PresenterPanel";
import { RuntimePanel } from "./RuntimePanel";
import st from "./stage.module.css";

/** The demo stage: presenter controls, the joiner's phone (or Priya's HR console), Navo's runtime. */
export function Stage() {
  return (
    <GuideProvider>
      <StageLayout />
      <CaptionBar />
      <IntroBrief />
      <ImpactOutro />
    </GuideProvider>
  );
}

function StageLayout() {
  const { view } = useNavo();
  const { overlay } = useGuide();
  // While the brief or the impact screen is open, the stage behind it is out of reach.
  return (
    <main className={st.stage} inert={overlay !== null}>
      <PresenterPanel />
      {view === "hr" ? <HrConsole /> : <Phone />}
      <RuntimePanel />
    </main>
  );
}
