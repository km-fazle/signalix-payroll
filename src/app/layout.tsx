import type { Metadata } from "next";
import { Montserrat, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const sans = Montserrat({
  subsets: ["latin"],
  weight: ["300", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signalix Payroll",
  description: "Review payment screenshots and reconcile weekly payroll.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body style={{ fontFamily: "var(--font-sans)" }}>{children}</body>
    </html>
  );
}
