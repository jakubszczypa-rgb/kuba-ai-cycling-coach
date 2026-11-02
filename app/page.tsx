"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CoachData = {
  date: string;
  athlete: { name: string | null; ftpW: number; vo2max: number | null; goal: string | null };
  today: { feeling: string; availableMinutes: number; nightShift: boolean; illness: boolean; health: {
    sleep_minutes: number | null; sleep_score: number | null; resting_hr: number | null;
    hrv_ms: number | null; hrv_status: string | null; body_battery: number | null;
  } | null };
  analytics: { load7d: number; load28d: number; hours7d: number; hours28d: number; powerHrEfficiency: number | null; hardSessions7d: number; trainingStatus: string; formScore: number | null };
  streamAnalysis?: { analyzedActivities: number; hrUsableSessions: number; powerUsableSessions: number; hrOnlySessions: number };
  decision: { decision: string; intensity: string; workoutType: string; durationMinutes: number; confidence: number; reasoning: string; workout: { title: string; steps: {name:string;durationMinutes:number;target:string}[] } | null };
  plan: { plan_date: string; title: string; workout_type: string; duration_minutes: number; status: string }[];
};

export default function Home() {
  const [data, setData] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/coach/today", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error === "UNAUTHENTICATED" ? "Zaloguj się, aby zobaczyć swój dashboard." : payload?.error || "Nie udało się pobrać danych coacha.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd pobierania danych.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-slate-300"><div className="mx-auto max-w-6xl">Ładowanie Twojego dashboardu treningowego…</div></main>;

  if (!data) return <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100"><div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-7"><p className="text-sm uppercase tracking-widest text-cyan-400">KUBA AI CYCLING COACH</p><h1 className="mt-3 text-3xl font-semibold">Twój trener kolarski</h1><p className="mt-3 text-slate-400">{error}</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/login" className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">Zaloguj się</Link><button onClick={refresh} className="rounded-xl border border-slate-700 px-5 py-3">Spróbuj ponownie</button></div></div></main>;

  const health = data.today.health;
  const decisionLabel = data.decision.decision === "REST" ? "Odpoczynek" : data.decision.decision === "EASY" ? "Lekka jazda" : "Trening";
  const statusColor = data.decision.decision === "REST" ? "text-amber-300" : data.decision.intensity === "HIGH" ? "text-cyan-300" : "text-emerald-300";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-400">KUBA AI CYCLING COACH</p><h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Cześć{data.athlete.name ? ", " + data.athlete.name : ""}.</h1><p className="mt-2 text-slate-400">Twój trening, regeneracja i plan w jednym miejscu · {data.date}</p></div>
          <button onClick={refresh} className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:border-cyan-400">Odśwież dane</button>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-cyan-900/70 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm uppercase tracking-widest text-cyan-400">Decyzja coacha na dziś</p><span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Pewność {Math.round(data.decision.confidence * 100)}%</span></div>
            <h2 className={"mt-3 text-4xl font-semibold " + statusColor}>{decisionLabel}</h2>
            <p className="mt-2 text-xl">{data.decision.workout?.title ?? "Regeneracja"}</p>
            <p className="mt-2 text-sm text-slate-400">{data.decision.durationMinutes} min · {data.decision.intensity} · {data.decision.workoutType}</p>
            <p className="mt-5 max-w-3xl leading-7 text-slate-300">{data.decision.reasoning}</p>
            {data.decision.workout && <div className="mt-5 space-y-2">{data.decision.workout.steps.map((step,i)=><div key={i} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm"><span>{step.name} · {step.durationMinutes} min</span><span className="text-cyan-300">{step.target}</span></div>)}</div>}
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/today" className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">Szczegóły treningu</Link><Link href="/check-in" className="rounded-xl border border-slate-700 px-5 py-3">Zrób check-in</Link></div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-sm uppercase tracking-widest text-slate-500">Regeneracja Garmin</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric label="Sen" value={health?.sleep_minutes ? (health.sleep_minutes / 60).toFixed(1) + " h" : "—"} />
              <Metric label="Sleep score" value={health?.sleep_score != null ? String(health.sleep_score) : "—"} />
              <Metric label="HRV" value={health?.hrv_ms != null ? health.hrv_ms + " ms" : "—"} />
              <Metric label="Body Battery" value={health?.body_battery != null ? String(health.body_battery) : "—"} />
            </div>
            <p className="mt-4 text-sm text-slate-400">Status HRV: {health?.hrv_status ?? "brak danych"} · Tętno spoczynkowe: {health?.resting_hr ?? "—"} bpm</p>
            <Link href="/analysis" className="mt-5 inline-block text-sm text-cyan-300 hover:text-cyan-200">Pełna analiza regeneracji →</Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="FTP" value={data.athlete.ftpW + " W"} />
          <Metric label="Obciążenie 7 dni" value={String(data.analytics.load7d)} />
          <Metric label="Czas 7 dni" value={data.analytics.hours7d + " h"} />
          <Metric label="Mocne sesje 7 dni" value={String(data.analytics.hardSessions7d)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Ostatnie dane treningowe</h2>
            <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Obciążenie 28 dni" value={String(data.analytics.load28d)} /><Metric label="Czas 28 dni" value={data.analytics.hours28d + " h"} /><Metric label="Forma" value={data.analytics.trainingStatus} /><Metric label="Form score" value={data.analytics.formScore == null ? "—" : data.analytics.formScore + "/100"} /></div>
            <p className="mt-4 text-sm text-slate-400">Sesje ze strumieniami: {data.streamAnalysis?.analyzedActivities ?? 0} · HR użyteczne: {data.streamAnalysis?.hrUsableSessions ?? 0} · Moc użyteczna: {data.streamAnalysis?.powerUsableSessions ?? 0} · Outdoor HR-only: {data.streamAnalysis?.hrOnlySessions ?? 0}</p>
            <Link href="/analysis" className="mt-4 inline-block text-sm text-cyan-300">Przejdź do analizy →</Link>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xl font-semibold">Najbliższy plan</h2>
            <div className="mt-4 space-y-2">{data.plan.length ? data.plan.slice(0,5).map((item,i)=><div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-slate-500">{item.plan_date} · {item.status}</p></div><span className="text-sm text-cyan-300">{item.duration_minutes} min</span></div>) : <p className="text-sm text-slate-500">Nie masz jeszcze planu. Dodaj grafik pracy, aby go wygenerować.</p>}</div>
            <Link href="/plan" className="mt-4 inline-block text-sm text-cyan-300">Grafik i plan treningowy →</Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NavCard href="/analysis" title="Moja forma" detail="Trendy mocy, tętna i obciążenia" />
          <NavCard href="/plan" title="Grafik + plan" detail="Zmiany 7/7 i treningi na 3 tygodnie" />
          <NavCard href="/workout" title="Kreator treningu" detail="Zaprojektuj sesję i eksportuj do Zwifta" />
          <NavCard href="/profile" title="Profil i Garmin" detail="FTP, dane zawodnika i synchronizacja" />
        </section>
      </div>
    </main>
  );
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
function NavCard({href,title,detail}:{href:string;title:string;detail:string}) {
  return <Link href={href} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-700"><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-slate-400">{detail}</p></Link>;
}
