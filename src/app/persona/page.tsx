import type { Metadata } from "next";
import { COMPANY } from "@/content/company";
import { NavoFace, type NavoFaceState } from "@/ui/components/NavoFace";
import styles from "./persona.module.css";

export const metadata: Metadata = { title: "Navo persona" };

const STATES: { id: NavoFaceState; name: string; when: string; line: string }[] = [
  { id: "brand", name: "Identity", when: "Logo, launch, sign-in", line: "“Hi, I'm Navo.”" },
  { id: "calm", name: "Calm", when: "Everything on track", line: "“You're all set for Monday.”" },
  { id: "watching", name: "Watching", when: "Monitoring quietly", line: "“Watching 9 items for you.”" },
  { id: "thinking", name: "Thinking", when: "Checking state and policy", line: "“Let me check what your laptop depends on.”" },
  { id: "acting", name: "Acting", when: "Taking a permitted action", line: "“Raising your laptop request with IT.”" },
  { id: "waiting", name: "Waiting", when: "On HR, IT or a vendor", line: "“Waiting for IT to confirm.”" },
  { id: "concerned", name: "Concerned", when: "A risk is forming", line: "“Your Employee ID is late. I'm on it.”" },
  { id: "needs", name: "Needs you", when: "Only you can do this", line: "“I need your OK for a loaner laptop.”" },
  { id: "celebrating", name: "Celebrating", when: "Milestone reached", line: "“You're ready for Day 1.”" },
];

export default function PersonaPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <NavoFace state="brand" size={180} />
        <div className={styles.heroText}>
          <span className={styles.kicker}>Persona</span>
          <h1 className={styles.title}>{COMPANY.product}</h1>
          <span className={styles.tagline}>{COMPANY.tagline}</span>
          <p className={styles.promise}>
            Navo doesn&apos;t show you your onboarding.
            <br />
            Navo takes care of it.
          </p>
        </div>
      </section>
      <h2 className={styles.subtitle}>One character, nine states. The face tells you what Navo is doing before you read a word.</h2>
      <ul className={styles.grid}>
        {STATES.map((s) => (
          <li key={s.id} className={styles.card}>
            <NavoFace state={s.id} size={76} decorative />
            <span className={styles.name}>{s.name}</span>
            <span className={styles.when}>{s.when}</span>
            <span className={styles.line}>{s.line}</span>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>{COMPANY.disclaimer}</p>
    </main>
  );
}
