import type { Metadata } from "next";
import { HomeBar } from "@/ui/components/HomeBar";
import { HrConsole } from "@/ui/hr/HrConsole";
import { NavoProvider } from "@/ui/state/NavoStore";

export const metadata: Metadata = { title: "Navo · HR console" };

/** Priya's HR console on its own. Polls so it follows the joiner's phone in another tab. */
export default function HrPage() {
  return (
    <NavoProvider pollMs={4000}>
      <HomeBar />
      <HrConsole fullscreen />
    </NavoProvider>
  );
}
