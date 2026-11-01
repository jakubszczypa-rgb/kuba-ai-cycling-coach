"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPlan } from "@/lib/coach/plan-builder";

export default function PlanPage() {
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("Ładowanie planu...");
  const [saving,setSaving]=useState(false);

  async function load() {
    const supabase=createClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Zaloguj się, aby zapisać plan.");return;}
    const {data:profile}=await supabase.from("athlete_profile").select("id").eq("user_id",user.id).maybeSingle();
    if(!profile){setMessage("Brak profilu zawodnika.");return;}
    const {data}=await supabase.from("plan_days").select("*").eq("athlete_id",profile.id).order("plan_date");
    setRows(data??[]);
    setMessage((data??[]).length?"":"Plan nie jest jeszcze zapisany.");
  }

  useEffect(()=>{load()},[]);

  async function generateAndSave(){
    setSaving(true);
    const supabase=createClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Zaloguj się.");setSaving(false);return;}
    const {data:profile}=await supabase.from("athlete_profile").select("id").eq("user_id",user.id).maybeSingle();
    if(!profile){setMessage("Najpierw wykonaj pierwszy check-in.");setSaving(false);return;}
    const days=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return {date:d.toISOString().slice(0,10),availableMinutes:i%4===0?120:75,nightShift:false};});
    const plan=buildPlan(days[0].date,days,238);
    const payload=plan.map(p=>({athlete_id:profile.id,plan_date:p.date,title:p.title,workout_type:p.type,duration_minutes:p.durationMinutes,priority:p.priority,status:p.status}));
    const {error}=await supabase.from("plan_days").upsert(payload,{onConflict:"athlete_id,plan_date"});
    setSaving(false);
    if(error){setMessage(error.message);return;}
    setMessage("Plan zapisany.");
    await load();
  }

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100"><div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">DYNAMIC PLAN</p><h1 className="mt-2 text-4xl font-semibold">Plan na 14 dni</h1><p className="mt-2 text-slate-400">Plan jest zapisywany do profilu i będzie mógł być przebudowywany przez coacha.</p></header>
    <button disabled={saving} onClick={generateAndSave} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{saving?"Zapisywanie...":"Wygeneruj i zapisz plan"}</button>
    {message&&<p className="text-sm text-slate-400">{message}</p>}
    <div className="space-y-3">{rows.map(p=><div key={p.id} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[120px_1fr_120px_110px]"><span className="text-slate-400">{p.plan_date}</span><div><b>{p.title}</b><p className="text-sm text-slate-500">{p.priority}</p></div><span className="text-cyan-300">{p.duration_minutes} min</span><span>{p.workout_type}</span></div>)}</div>
  </div></main>;
}
