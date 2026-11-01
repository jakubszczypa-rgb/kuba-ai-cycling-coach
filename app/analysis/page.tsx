"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeTraining, type ActivitySample } from "@/lib/coach/analytics";

type ActivityRow = ActivitySample & { sport: string | null };

export default function AnalysisPage() {
  const [result, setResult] = useState<ReturnType<typeof analyzeTraining> | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [message, setMessage] = useState("Ładowanie danych...");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage("Zaloguj się, aby zobaczyć analizę."); return; }

      const { data: profile } = await supabase.from("athlete_profile")
        .select("id,current_ftp_w").eq("user_id", user.id).maybeSingle();
      if (!profile) { setMessage("Brak profilu zawodnika."); return; }

      const { data, error } = await supabase.from("garmin_activities")
        .select("activity_start,duration_sec,avg_power_w,normalized_power_w,avg_hr,tss,sport")
        .eq("athlete_id", profile.id).order("activity_start", { ascending: false }).limit(500);

      if (error) { setMessage("Nie udało się pobrać treningów: " + error.message); return; }

      const rows: ActivityRow[] = (data ?? []).map((a: any) => ({
        date: a.activity_start,
        durationMinutes: (a.duration_sec ?? 0) / 60,
        avgPowerW: a.avg_power_w,
        normalizedPowerW: a.normalized_power_w,
        avgHr: a.avg_hr,
        tss: a.tss,
        sport: a.sport,
      }));

      setActivities(rows);
      setResult(analyzeTraining(rows, profile.current_ftp_w ?? 238));
      setMessage("");
    }
    load();
  }, []);

  const chart = buildWeeklyChart(activities, 90);
  if (!result) return <main className="min-h-screen bg-slate-950 p-8 text-slate-300">{message}</main>;

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">OSOBISTY TRENER</p>
        <h1 className="mt-2 text-4xl font-semibold">Moja forma</h1>
        <p className="mt-2 text-slate-400">Coach analizuje rzeczywiste treningi z Garmina i pokazuje, jak idzie progres.</p>
      </header>
      <section className="rounded-3xl border border-cyan-900/60 bg-slate-900/80 p-6">
        <p className="text-sm text-slate-400">Ocena aktualnej formy</p>
        <h2 className="mt-1 text-3xl font-bold">{result.trainingStatus === "BUILDING" ? "Forma rośnie ↗" : result.trainingStatus === "FATIGUED" ? "Organizm zmęczony ↓" : result.trainingStatus === "STABLE" ? "Forma stabilna →" : "Za mało danych"}</h2>
        {result.formScore !== null && <p className="mt-2 text-slate-400">Form Score: <span className="font-semibold text-white">{result.formScore}/100</span></p>}
        <p className="mt-3 text-slate-300">{result.efficiencyChangePct !== null ? `Efektywność Power/HR zmieniła się o ${result.efficiencyChangePct > 0 ? "+" : ""}${result.efficiencyChangePct}% względem wcześniejszej części ostatnich 28 dni. ` : ""}{result.hardSessions7d >= 3 ? "Masz sporo mocnych jednostek — regeneracja jest teraz ważna." : "Liczba mocnych jednostek nie wygląda obecnie na nadmierną."}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Load 7d" value={String(result.load7d)} />
        <Metric label="Load 28d" value={String(result.load28d)} />
        <Metric label="Godziny 7d" value={String(result.hours7d) + " h"} />
        <Metric label="Moc / HR" value={result.powerHrEfficiency ? String(result.powerHrEfficiency) : "Brak danych"} />
        <Metric label="Form Score" value={result.formScore !== null ? String(result.formScore) + "/100" : "—"} />
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Metric label="Godziny 28d" value={String(result.hours28d) + " h"} />
        <Metric label="Mocny trening 7d" value={String(result.hardSessions7d)} />
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Efektywność</h2>
        <p className="mt-2 text-slate-300">
          {result.efficiencyTrend === "INSUFFICIENT_DATA"
            ? "Na razie za mało porównywalnych treningów, żeby wiarygodnie ocenić trend."
            : result.efficiencyTrend === "IMPROVING" ? "Poprawa — przy podobnym tętnie generujesz więcej mocy."
            : result.efficiencyTrend === "DECLINING" ? "Spadek — sprawdzimy regenerację i obciążenie."
            : "Stabilnie — efektywność jest obecnie podobna."}
        </p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Ostatnie treningi</h2>
        <div className="mt-4 space-y-2">
          {activities.slice(0, 10).map((a, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div>
                <p className="font-medium">{a.sport || "Training"}</p>
                <p className="text-sm text-slate-500">{new Date(a.date).toLocaleString("pl-PL")}</p>
              </div>
              <div className="text-sm text-slate-300">
                {Math.round(a.durationMinutes)} min · {a.avgPowerW ? Math.round(a.avgPowerW) + " W" : "— W"} · {a.avgHr ? Math.round(a.avgHr) + " bpm" : "— bpm"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  </main>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
