"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Summary = { strava_activity_id: number; activity_start: string; duration_sec: number; sample_count: number; metrics: any };
type Detail = { streams: Record<string, { data?: Array<number | null> }>; metrics: any; duration_sec: number };

export default function StreamAnalysisPanel() {
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ładowanie zapisanych strumieni...");\n  const [aiLoading, setAiLoading] = useState(false);\n  const [aiAnalysis, setAiAnalysis] = useState("");\n  const [aiError, setAiError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage("Zaloguj się, aby zobaczyć analizę."); return; }
      const { data: profile } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { setMessage("Brak profilu zawodnika."); return; }
      const { data, error } = await supabase.from("strava_activity_streams")
        .select("strava_activity_id,activity_start,duration_sec,sample_count,metrics")
        .eq("athlete_id", profile.id).order("activity_start", { ascending: false }).limit(100);
      if (error) { setMessage("Nie udało się pobrać strumieni: " + error.message); return; }
      const rows = (data ?? []) as Summary[];
      setItems(rows);
      if (rows.length) {
        const id = String(rows[0].strava_activity_id);
        setSelected(id);
        await loadDetail(id);
      } else setMessage("Brak danych sekundowych. Uruchom synchronizację Stravy w profilu, aby pobrać strumienie treningów.");
    }
    async function loadDetail(id: string) {
      setLoading(true);
      try {
        const response = await fetch("/api/strava/streams?activityId=" + id);
        if (response.ok) setDetail(await response.json());
        else setMessage("Nie udało się pobrać szczegółów treningu.");
      } finally { setLoading(false); }
    }
    load();
  }, []);

  async function choose(id: string) {
    setSelected(id);
    setDetail(null);
    setLoading(true);
    try {
      const response = await fetch("/api/strava/streams?activityId=" + id);
      if (response.ok) setDetail(await response.json());
      else setMessage("Nie udało się pobrać szczegółów treningu.");
    } finally { setLoading(false); }
  }

  return <section className="rounded-3xl border border-cyan-900/60 bg-slate-900/80 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">Analiza sekundowa — moc i tętno</h2>
        <p className="mt-1 text-sm text-slate-400">Surowe strumienie ze Stravy. Porównanie reakcji tętna z mocą w czasie.</p>
      </div>
      {items.length > 0 && <select value={selected} onChange={e => choose(e.target.value)} className="max-w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        {items.map(a => <option key={a.strava_activity_id} value={String(a.strava_activity_id)}>
          {new Date(a.activity_start).toLocaleDateString("pl-PL") + " · " + Math.round(a.duration_sec / 60) + " min · " + a.sample_count.toLocaleString("pl-PL") + " próbek"}
        </option>)}
      </select>}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={aiLoading} onClick={async () => {
        setAiLoading(true); setAiError(""); setAiAnalysis("");
        try {
          const response = await fetch("/api/coach/stream-analysis", { method: "POST" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || data.error || "Nie udało się wykonać analizy AI.");
          setAiAnalysis(data.analysis);
        } catch (error) { setAiError(error instanceof Error ? error.message : "Błąd analizy AI."); }
        finally { setAiLoading(false); }
      }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {aiLoading ? "AI analizuje treningi…" : "Analizuj 90 dni przez AI"}
      </button>
      <span className="text-xs text-slate-500">Analiza obejmuje zapisane treningi sekundowe, interwały i HR recovery.</span>
    </div>
    {aiError && <p className="mt-3 text-sm text-rose-300">{aiError}</p>}
    {aiAnalysis && <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-cyan-900/60 bg-slate-950/70 p-5 text-sm leading-7 text-slate-200">{aiAnalysis}</div>}
    {items.length === 0 ? <p className="mt-5 rounded-xl bg-slate-950 p-4 text-sm text-slate-400">{message}</p>
      : loading || !detail ? <p className="mt-5 text-sm text-slate-400">Ładowanie szczegółów treningu…</p>
      : <>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-400">
          <span><i className="mr-1 inline-block h-2 w-2 rounded bg-cyan-400"/> Moc (W)</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded bg-amber-400"/> Tętno (bpm)</span>
        </div>
        <StreamChart streams={detail.streams} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Mini label="Średnia moc" value={detail.metrics.avgPowerW != null ? detail.metrics.avgPowerW + " W" : "—"} />
          <Mini label="Średnie tętno" value={detail.metrics.avgHr != null ? detail.metrics.avgHr + " bpm" : "—"} />
          <Mini label="Aerobic decoupling" value={detail.metrics.aerobicDecouplingPct != null ? detail.metrics.aerobicDecouplingPct + "%" : "Za mało danych"} />
          <Mini label="Wykryte interwały" value={String(detail.metrics.intervals?.length ?? 0)} />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <h3 className="font-semibold">Wnioski z treningu</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{detail.metrics.aerobicDecouplingPct == null
            ? "Nie da się wiarygodnie policzyć dryfu tętna z tego treningu — potrzebny jest dłuższy, ciągły fragment w zakresie 55–78% FTP z jednoczesnym zapisem mocy i HR."
            : detail.metrics.aerobicDecouplingPct > 5
              ? "W drugiej części jazdy efektywność moc/HR spadła o " + detail.metrics.aerobicDecouplingPct + "%. To sygnał dryfu tętna; interpretujemy go razem z temperaturą, nawodnieniem, zmęczeniem i profilem trasy."
              : "Dryf mocy względem tętna wyniósł " + detail.metrics.aerobicDecouplingPct + "%. W tym treningu reakcja układu krążenia była względnie stabilna w analizowanym zakresie tlenowym."}</p>
          {detail.metrics.intervals?.length > 0 && <div className="mt-3 space-y-2">
            {detail.metrics.intervals.slice(0, 12).map((x: any, i: number) => <div key={i} className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-2 text-sm">
              <span>Interwał {i + 1} · {Math.round(x.durationSec / 60 * 10) / 10} min · {x.avgPowerW} W</span>
              <span className="text-slate-400">{x.avgHr ?? "—"} bpm · spadek HR po wysiłku: {x.recoveryHrDropBpm ?? "—"} bpm</span>
            </div>)}
          </div>}
        </div>
      </>}
  </section>;
}

function StreamChart({ streams }: { streams: Record<string, { data?: Array<number | null> }> }) {
  const power = (streams.watts?.data ?? []).map(v => typeof v === "number" ? v : null);
  const hr = (streams.heartrate?.data ?? []).map(v => typeof v === "number" ? v : null);
  const time = streams.time?.data ?? [];
  const count = Math.max(power.length, hr.length);
  if (!count) return <p className="mt-4 text-sm text-slate-400">Brak próbek mocy i tętna.</p>;
  const stride = Math.max(1, Math.ceil(count / 1200));
  const p = power.filter((v): v is number => v !== null);
  const h = hr.filter((v): v is number => v !== null);
  const pMin = 0, pMax = Math.max(100, ...p) * 1.05;
  const hMin = Math.max(60, Math.floor((Math.min(...h, 90) - 10) / 10) * 10);
  const hMax = Math.max(hMin + 20, Math.ceil((Math.max(...h, 150) + 10) / 10) * 10);
  const points = (values: Array<number | null>, min: number, max: number) => values.map((v, i) => v === null ? null : (i / (count - 1 || 1) * 1000) + "," + (240 - ((v - min) / (max - min)) * 220)).filter(Boolean).filter((_, i) => i % stride === 0).join(" ");
  const duration = Number(time[time.length - 1] ?? count);
  return <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2">
    <div className="flex justify-between px-2 text-[10px] text-slate-500"><span>0 W / {hMin} bpm</span><span>{Math.round(duration / 60)} min</span><span>{Math.round(pMax)} W / {hMax} bpm</span></div>
    <svg viewBox="0 0 1000 260" className="w-full" role="img" aria-label="Wykres mocy i tętna w czasie">
      {[20, 75, 130, 185, 240].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#334155" strokeDasharray="4 6"/>)}
      <polyline points={points(power, pMin, pMax)} fill="none" stroke="#22d3ee" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>
      <polyline points={points(hr, hMin, hMax)} fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  </div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
