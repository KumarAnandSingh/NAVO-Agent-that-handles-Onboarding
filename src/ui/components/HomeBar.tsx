import Link from "next/link";
import styles from "./HomeBar.module.css";

/**
 * The Back to Home bar, pinned to the top of every screen except the intro itself. On the
 * demo stage Home is the intro overlay, so the stage passes `onHome`; other pages link to /.
 */
export function HomeBar({ onHome, inert }: { onHome?: () => void; inert?: boolean }) {
  return (
    <header className={styles.bar} inert={inert}>
      {onHome ? (
        <button type="button" className={styles.home} onClick={onHome} title="Back to Home (B)">
          ← Back to Home
        </button>
      ) : (
        <Link href="/" className={styles.home}>
          ← Back to Home
        </Link>
      )}
    </header>
  );
}
