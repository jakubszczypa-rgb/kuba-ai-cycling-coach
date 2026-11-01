"use client";

import { useEffect, useState } from "react";

type Feeling = "great" | "good" | "average" | "tired" | "wrecked";

type CoachResponse = {
  today: { feeling: Feeling; availableMinutes: number; nightShift: boolean; illness: boolean; health: any };
  analytics: { load7d: number; load28d: number; hours7d: number; powerHrEfficiency: number | null; hardSessions7d: number; efficiencyTrend: string };
  decision: {
    decision: string; intensity: string; workoutType: string; durationMinutes: number;
    confidence: number; reasoning: string;
    workout: { title: string; steps: { name: string; durationMinutes: number; target: string; purpose: string }[] } | null;
  };
};

export default function TodayCoachPage() {
  const [feeling,setFeeling]=useState<Feeling>("good");
  const [minutes,setMinutes]=useState(60);
  const [nightShift,setNightShift]=useState(false);
  const [illness,setIllness]=useState(false);
  const [result,setResult]=useState<CoachResponse | null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");

  async function loadCoach() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/coach/today", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Nie udało się pobrać decyzji coacha.");
      setResult(data);
      setFeeling(data.today.feeling);
      setMinutes(data.today.availableMinutes);
      setNightShift(data.today.nightShift);
      setIllness(data.today.illness);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Błąd ładowania coacha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCoach(); }, []);

  if (loading) return <main className="min-h-screen bg-slate-950 p-8 text-slate-300">Ładowanie prawdziwych danych Garmina i decyzji coacha...</main>;

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">KUBA AI COACH</p>
        <h1 className="mt-2 text-4xl font-semibold">Co robimy dzisiaj?</h1>
        <p className="mt-2 text-slate-400">Decyzja wykorzystuje profil, Garmin, dane regeneracji i dzisiejszy check-in.</p>
      </header>

      {message && <div className="rounded-2xl border border-rose-900 bg-rose-950/30 p-4 text-rose-200">{message}</div>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Load 7d" value={String(result?.analytics.load7d ?? "—")} />
        <Metric label="Load 28d" value={String(result?.analytics.load28d ?? "—")} />
        <Metric label="Godziny 7d" value={String(result?.analytics.hours7d ?? "—") + " h"} />
        <Metric label="Moc / HR" value={result?.analytics.powerHrEfficiency ? String(result.analytics.powerHrEfficiency) : "—"} />
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
        <div><p className="mb-3 text-sm text-slate-400">Samopoczucie</p><div className="flex flex-wrap gap-2">{([
          ["great","Bardzo dobrze"],["good","Dobrze"],["average","Średnio"],["tired","Zmęczony"],["wrecked","Zajechany"]
        ] as [Feeling,string][]).map(([value,label])=><button key={value} onClick={()=>setFeeling(value)} className={"rounded-xl px-4 py-2 " + (feeling===value ? "bg-white text-black" : "bg-slate-800")}>{label}</button>)}</div></div>

        <label className="block">Mam dzisiaj <b>{minutes} min</b><input className="mt-3 w-full" type="range" min="0" max="180" step="15" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>

        <label className="flex items-center gap-3"><input type="checkbox" checked={nightShift} onChange={e=>setNightShift(e.target.checked)}/> Jestem po nocnej zmianie</label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={illness} onChange={e=>setIllness(e.target.checked)}/> Jestem chory / nie czuję się dobrze</label>

        <p className="text-sm text-slate-500">Zmień parametry tutaj, a następnie zapisz je przez stronę „Check-in”. Decyzja poniżej jest ostatnią decyzją pobraną z coach engine.</p>
      </section>

      {result && <section className="rounded-3xl border border-cyan-900 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm uppercase tracking-wider text-cyan-400">DECYZJA</p><h2 className="mt-2 text-3xl font-bold">{result.decision.decision} · {result.decision.workoutType}</h2></div>
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right"><p className="text-xs text-slate-500">PEWNOŚĆ</p><p className="text-xl font-semibold">{Math.round(result.decision.confidence * 100)}%</p></div>
        </div>
        <p className="mt-2 text-slate-400">{result.decision.durationMinutes} min · {result.decision.intensity}</p>
        <p className="mt-4 leading-7 text-slate-300">{result.decision.reasoning}</p>
        {result.decision.workout && <div className="mt-6 space-y-3"><h3 className="text-xl font-semibold">{result.decision.workout.title}</h3>{result.decision.workout.steps.map((s,i)=><div key={i} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[1fr_90px_1fr]"><b>{s.name}</b><span>{s.durationMinutes} min</span><span className="text-cyan-300">{s.target}</span><p className="sm:col-span-3 text-sm text-slate-500">{s.purpose}</p></div>)}</div>}
      </section>}
    </div>
  </main>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
