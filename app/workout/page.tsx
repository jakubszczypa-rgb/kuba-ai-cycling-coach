"use client";

import { useMemo, useState } from "react";
import { generateWorkout } from "@/lib/coach/workout-generator";

export default function WorkoutPage() {
  const [type, setType] = useState("ENDURANCE");
  const [minutes, setMinutes] = useState(60);
  const ftp = 238;
  const workout = useMemo(() => generateWorkout(type, minutes, ftp), [type, minutes]);

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-4xl space-y-6">
      <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">WORKOUT BUILDER</p><h1 className="mt-2 text-4xl font-semibold">Konkretny trening</h1></header>
      <section className="flex flex-wrap gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        {["ENDURANCE","RECOVERY","SWEET_SPOT"].map(x => <button key={x} onClick={() => setType(x)} className={"rounded-xl px-4 py-2 " + (type === x ? "bg-white text-black" : "bg-slate-800")}>{x}</button>)}
        <label className="flex items-center gap-2">Czas <input className="w-24 rounded-lg bg-slate-800 p-2" type="number" min="30" max="240" step="15" value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
      </section>
      <section className="rounded-3xl border border-cyan-900 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">{workout.title}</h2>
        <p className="mt-1 text-slate-400">{workout.durationMinutes} min · FTP {ftp} W</p>
        <div className="mt-5 space-y-3">{workout.steps.map((s, i) => <div key={i} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[1fr_100px_1.5fr]"><b>{s.name}</b><span>{s.durationMinutes} min</span><span className="text-cyan-300">{s.target}</span><p className="sm:col-span-3 text-sm text-slate-400">{s.purpose}</p></div>)}</div>
      </section>
    </div>
  </main>;
}
