import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../apps/web/src/styles.css";

export const metadata: Metadata = {
  title: "EdgeCircuit | Cognitive fitness for serious work",
  description:
    "EdgeCircuit offers short, evidence-aware cognitive fitness for serious work.",
};

export const viewport: Viewport = {
  themeColor: "#0b1420",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
