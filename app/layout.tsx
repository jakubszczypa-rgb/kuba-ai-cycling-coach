import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kuba AI Cycling Coach",
  description: "Adaptive AI cycling coach built around Garmin data and shift work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <nav className="border-b border-slate-800 bg-slate-950/95 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link href="/" className="font-semibold">KUBA AI COACH</Link>
            <div className="flex gap-4 text-sm text-slate-400">
              <Link href="/check-in">Check-in</Link>
              <Link href="/profile">Profil</Link>
              <Link href="/analysis">Analiza</Link>
              <Link href="/workout">Trening</Link>
              <Link href="/login">Logowanie</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
