import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kuba AI Cycling Coach",
  description: "Adaptive AI cycling coach built around Garmin data and shift work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
