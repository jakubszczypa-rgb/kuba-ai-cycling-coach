"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeTraining, type ActivitySample } from "@/lib/coach/analytics";

export default function AnalysisPage() {
  const [result, setResult] = useState<ReturnType<typeof analyzeTraining> | null>(null);
  const [message, setMessage] = useState("Ładowanie danych...");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage("Zaloguj się, aby zobaczyć analizę."); return; }

      const { data: profile } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { setMessage("Brak profilu zawodnika."); return; }

      const { data } = await supabase.from("garmin_activities")
        .select("activity_date,duration_seconds,avg_power_w,normalized_power_w,avg_hr,tss")
        .eq("athlete_id", profile.id).order("activity_date", { ascending: false }).limit(500);

      const activities: ActivitySample[] = (data ?? []).map((a: any) => ({
        date: a.activity_date,
        durationMinutes: (a.duration_seconds ?? 0) / 60,
        avgPowerW: a.avg_power_w,
        normalizedPowerW: a.normalized_power_w,
        avgHr: a.avg_hr,
        tss: a.tss,
      }));

      setResult(analyzeTraining(activities));
      setMessage("");
    }
    load();
  }, []);

  if (!result) return <main className="min-h-screen p-8 text-slate-300">{message}</main>;

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">TRAINING ENGINE</p><h1 className="mt-2 text-4xl font-semibold">Analiza obciążenia</h1></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Load 7d" value={String(result.load7d)} />
        <Metric label="Load 28d" value={String(result.load28d)} />
        <Metric label="Godziny 7d" value={`${result.hours7d} h`} />
        <Metric label="Efficiency W/HR" value={result.powerHrEfficiency ? String(result.powerHrEfficiency) : "Brak danych"} />
      </div>
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Trend</h2>
        <p className="mt-2 text-slate-300">{result.trend === "INSUFFICIENT_DATA" ? "Potrzebujemy danych z Garmina, żeby ocenić progres." : result.trend}</p>
      </section>
    </div>
  </main>;
}
function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
