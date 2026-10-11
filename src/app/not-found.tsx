import type { Metadata } from "next";
import { HomeLink } from "@/ui/components/HomeLink";
import { NavoFace } from "@/ui/components/NavoFace";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Navo · Page not found" };

export default function NotFound() {
  return (
    <main className={styles.page}>
      <NavoFace state="thinking" size={72} />
      <h1 className={styles.title}>This page isn&apos;t part of the demo.</h1>
      <HomeLink className={styles.home} />
    </main>
  );
}
