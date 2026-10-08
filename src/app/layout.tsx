import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navo · AI That Handles Onboarding",
  description: "Navo understands what's next, coordinates the work and steps in when needed. A Halden prototype with synthetic data.",
};

export const viewport: Viewport = {
  themeColor: "#0B1530",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
