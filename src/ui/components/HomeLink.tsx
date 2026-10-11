import Link from "next/link";
import styles from "./HomeLink.module.css";

/** "Back to Home" for the pages outside the demo stage: opens the intro at /. */
export function HomeLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`${styles.link} ${className}`}>
      ← Back to Home
    </Link>
  );
}
