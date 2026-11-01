"use client";

import { useState } from "react";

type CoachResult = {
  date: string;
  athlete: { name: string; ftpW: number; vo2max: number | null; goal: string | null };
  today: { feeling: string; availableMinutes: number; nightShift: boolean; illness: boolean; health: {
    sleep_minutes: number | null; sleep_score: number | null; resting_hr: number | null;
    hrv_ms: number | null; hrv_status: string | null; body_battery: number | null;
  } | null };
  analytics: { load7d: number; load28d: number; hours7d: number; hours28d: number; powerHrEfficiency: number | null; trend: string };
  decision: {
    decision: string; intensity: string; workoutType: string; durationMinutes: number;
    confidence: number; reasoning: string;
    workout: { title: string; durationMinutes: number; targetPowerMinW?: number; targetPowerMaxW?: number; structure: unknown[] } | null;
  };
  plan: { plan_date: string; title: string; workout_type: string; duration_minutes: number; priority: string; status: string }[];
};

export default function CoachPage() {
  const [result, setResult] = useState<CoachResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function askCoach() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/coach/today", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Nie udało się pobrać decyzji coacha.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać decyzji coacha.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">AI COACH</p>
        <h1 className="mt-2 text-4xl font-semibold">Co robimy dzisiaj?</h1>
        <p className="mt-2 text-slate-400">Decyzja jest liczona z profilu, check-inu, obciążenia i danych Garmin zapisanych w bazie.</p>
      </header>

      <button onClick={askCoach} disabled={loading}
        className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-black disabled:opacity-50">
        {loading ? "Coach analizuje..." : "Zapytaj coacha"}
      </button>

      {error && <section className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-red-200">{error}</section>}

      {result && <>
        <section className="rounded-3xl border border-cyan-900 bg-slate-900 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-sm text-cyan-400">DECYZJA NA {result.date}</p><h2 className="mt-2 text-4xl font-bold">{result.decision.decision}</h2></div>
            <div className="text-right text-slate-300">{result.decision.intensity} · {result.decision.durationMinutes} min<br/>
              <span className="text-sm text-slate-500">pewność {Math.round(result.decision.confidence * 100)}%</span>
            </div>
          </div>
          <p className="mt-5 leading-7 text-slate-300">{result.decision.reasoning}</p>
        </section>

        {result.decision.workout && <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm uppercase tracking-wider text-cyan-400">TRENING</p>
          <h3 className="mt-2 text-2xl font-semibold">{result.decision.workout.title}</h3>
          <p className="mt-2 text-slate-400">{result.decision.workout.durationMinutes} min · {result.decision.workout.targetPowerMinW ?? "—"}–{result.decision.workout.targetPowerMaxW ?? "—"} W</p>
          <div className="mt-4 space-y-2">{result.decision.workout.structure.map((step, i) => <div key={i} className="rounded-xl border border-slate-800 p-3 text-sm">{JSON.stringify(step)}</div>)}</div>
        </section>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="FTP" value={`${result.athlete.ftpW} W`} />
          <Metric label="7 dni" value={`${result.analytics.hours7d} h`} />
          <Metric label="28 dni" value={`${result.analytics.hours28d} h`} />
          <Metric label="Power / HR" value={result.analytics.powerHrEfficiency ? String(result.analytics.powerHrEfficiency) : "brak danych"} />
        </section>

        {result.today.health && <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-xl font-semibold">Regeneracja</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Metric label="Sen" value={result.today.health.sleep_minutes ? `${Math.round(result.today.health.sleep_minutes / 60 * 10) / 10} h` : "—"} />
            <Metric label="RHR" value={result.today.health.resting_hr ? `${result.today.health.resting_hr} bpm` : "—"} />
            <Metric label="HRV" value={result.today.health.hrv_ms ? `${result.today.health.hrv_ms} ms` : "—"} />
            <Metric label="Body Battery" value={result.today.health.body_battery ? String(result.today.health.body_battery) : "—"} />
          </div>
        </section>}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-xl font-semibold">Najbliższy plan</h3>
          <div className="mt-4 space-y-2">{result.plan.length ? result.plan.slice(0, 5).map((p, i) =>
            <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 p-3">
              <span>{p.plan_date}</span><span>{p.title}</span><span className="text-slate-500">{p.duration_minutes} min</span>
            </div>) : <p className="text-slate-500">Brak zaplanowanych treningów.</p>}</div>
        </section>
      </>}
    </div>
  </main>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
