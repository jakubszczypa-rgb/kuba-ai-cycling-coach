"use client";

import { useState } from "react";
import { coachToday } from "@/lib/coach/coach-today";

export default function TodayCoachPage() {
  const [feeling,setFeeling]=useState<"great"|"good"|"average"|"tired"|"wrecked">("good");
  const [minutes,setMinutes]=useState(60);
  const [nightShift,setNightShift]=useState(false);
  const [result,setResult]=useState<ReturnType<typeof coachToday>|null>(null);

  function runCoach() {
    setResult(coachToday({ feeling, availableMinutes: minutes, nightShift, ftpW: 238 }));
  }

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">KUBA AI COACH</p>
        <h1 className="mt-2 text-4xl font-semibold">Co robimy dzisiaj?</h1>
        <p className="mt-2 text-slate-400">Najpierw ocena gotowości, potem konkretny trening.</p>
      </header>
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
        <div><p className="mb-3 text-sm text-slate-400">Samopoczucie</p><div className="flex flex-wrap gap-2">{(["great","good","average","tired","wrecked"] as const).map(f=><button key={f} onClick={()=>setFeeling(f)} className={"rounded-xl px-4 py-2 " + (feeling===f ? "bg-white text-black" : "bg-slate-800")}>{f}</button>)}</div></div>
        <label className="block">Mam dzisiaj <b>{minutes} min</b><input className="mt-3 w-full" type="range" min="0" max="180" step="15" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={nightShift} onChange={e=>setNightShift(e.target.checked)}/> Jestem po nocnej zmianie</label>
        <button onClick={runCoach} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black">Uruchom coacha</button>
      </section>
      {result && <section className="rounded-3xl border border-cyan-900 bg-slate-900/70 p-6">
        <p className="text-sm uppercase tracking-wider text-cyan-400">DECYZJA</p>
        <h2 className="mt-2 text-3xl font-bold">{result.decision} · {result.workoutType}</h2>
        <p className="mt-2 text-slate-400">{result.durationMinutes} min · {result.intensity}</p>
        <p className="mt-4 leading-7 text-slate-300">{result.reasoning}</p>
        {result.workout && <div className="mt-6 space-y-3"><h3 className="text-xl font-semibold">{result.workout.title}</h3>{result.workout.steps.map((s,i)=><div key={i} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[1fr_90px_1fr]"><b>{s.name}</b><span>{s.durationMinutes} min</span><span className="text-cyan-300">{s.target}</span><p className="sm:col-span-3 text-sm text-slate-500">{s.purpose}</p></div>)}</div>}
      </section>}
    </div>
  </main>;
}
