"use client";

import { useMemo, useState } from "react";
import { buildPlan } from "@/lib/coach/plan-builder";

function dates(count:number) {
  const out:string[]=[];
  const d=new Date();
  for(let i=0;i<count;i++){ const x=new Date(d); x.setDate(d.getDate()+i); out.push(x.toISOString().slice(0,10)); }
  return out;
}

export default function PlanPage() {
  const ds=useMemo(()=>dates(14),[]);
  const [nightDays,setNightDays]=useState<number[]>([]);
  const [short,setShort]=useState(false);
  const days=ds.map((date,i)=>({date,availableMinutes:short?(i%3===0?30:60):(i%4===0?120:75),nightShift:nightDays.includes(i)}));
  const plan=buildPlan(ds[0],days,238);

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100"><div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">DYNAMIC PLAN</p><h1 className="mt-2 text-4xl font-semibold">Plan na 14 dni</h1><p className="mt-2 text-slate-400">Plan jest punktem wyjścia — dostępność i nocne zmiany mogą go zmienić.</p></header>
    <section className="flex flex-wrap gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <button onClick={()=>setShort(!short)} className="rounded-xl bg-slate-800 px-4 py-2">{short?"Przywróć normalny czas":"Pokaż tydzień z małą ilością czasu"}</button>
      <button onClick={()=>setNightDays(nightDays.length?[]:[2,3,9])} className="rounded-xl bg-slate-800 px-4 py-2">{nightDays.length?"Usuń nocne zmiany":"Dodaj nocne zmiany"}</button>
    </section>
    <div className="space-y-3">{plan.map((p,i)=><div key={p.id} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[120px_1fr_120px_110px]"><span className="text-slate-400">{p.date}</span><div><b>{p.title}</b><p className="text-sm text-slate-500">{p.priority}</p></div><span className="text-cyan-300">{p.durationMinutes} min</span><span className={p.type==="REST"?"text-slate-500":"text-slate-300"}>{p.type}</span></div>)}</div>
  </div></main>;
}
