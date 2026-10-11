import type { Metadata } from "next";
import { HomeBar } from "@/ui/components/HomeBar";
import { Phone } from "@/ui/phone/Phone";
import { NavoProvider } from "@/ui/state/NavoStore";

export const metadata: Metadata = { title: "Navo · Anand's phone" };

/** The joiner's app on its own, full screen. Polls so it follows actions taken elsewhere. */
export default function PhonePage() {
  return (
    <NavoProvider initialScreen="auto" pollMs={4000}>
      <HomeBar />
      <Phone fullscreen />
    </NavoProvider>
  );
}
