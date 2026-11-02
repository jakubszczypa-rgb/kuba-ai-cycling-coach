"use client";

import { useEffect, useState } from "react";

type Feeling = "great" | "good" | "average" | "tired" | "wrecked";

type CoachResponse = {
  date?: string;
  athlete?: { ftpW: number };
  today: { feeling: Feeling; availableMinutes: number; nightShift: boolean; illness: boolean; health: any };
  analytics: { load7d: number; load28d: number; hours7d: number; powerHrEfficiency: number | null; hardSessions7d: number; efficiencyTrend: string };
  decision: {
    decision: string; intensity: string; workoutType: string; durationMinutes: number;
    confidence: number; reasoning: string;
    workout: { title: string; type: string; steps: { name: string; durationMinutes: number; target: string; purpose: string }[] } | null;
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
        {result.decision.workout && <div className="mt-6 space-y-3"><h3 className="text-xl font-semibold">{result.decision.workout.title}</h3><WorkoutChart steps={result.decision.workout.steps} ftp={result.athlete?.ftpW ?? 238} />{result.decision.workout.steps.map((s,i)=><div key={i} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[1fr_90px_1fr]"><b>{s.name}</b><span>{s.durationMinutes} min</span><span className="text-cyan-300">{s.target}</span><p className="sm:col-span-3 text-sm text-slate-500">{s.purpose}</p></div>)}
          <div className="rounded-2xl border border-cyan-900/70 bg-cyan-950/20 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-semibold">Gotowy trening do Zwifta</p><p className="mt-1 text-sm text-slate-400">Plik .ZWO z rozgrzewką, blokami pracy, przerwami i schłodzeniem. Trening steruje Kickr Core w ERG Mode.</p></div>
              <button onClick={() => downloadZwiftWorkout(result)} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Pobierz .ZWO</button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Mac: Finder → Dokumenty → Zwift → Workouts → folder z Twoim numerem Zwift ID. Wklej plik i uruchom ponownie Zwifta. Trening znajdziesz w Workouts → Custom.</p>
          </div>
        </div>}
      </section>}
    </div>
  </main>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}



type ChartStep = { name: string; durationMinutes: number; target: string; purpose: string };
const POWER_ZONES = [
  { name: "Z1", label: "Regeneracja", max: 0.55, color: "#64748b" },
  { name: "Z2", label: "Wytrzymałość", max: 0.75, color: "#22c55e" },
  { name: "Z3", label: "Tempo", max: 0.90, color: "#38bdf8" },
  { name: "Z4", label: "Próg", max: 1.05, color: "#f59e0b" },
  { name: "Z5", label: "VO₂ max", max: 1.20, color: "#f97316" },
  { name: "Z6", label: "Beztlenowa", max: 1.50, color: "#ef4444" },
  { name: "Z7", label: "Neuromięśniowa", max: 2.00, color: "#a855f7" },
];

function targetWatts(target: string, ftp: number) {
  const values = [...target.matchAll(/(\\d+(?:\\.\\d+)?)/g)].map(match => Number(match[1])).filter(Number.isFinite);
  if (!values.length) return { low: ftp * 0.4, high: ftp * 0.55 };
  if (/≤|<=/.test(target)) return { low: 0, high: values[0] };
  if (values.length > 1) return { low: Math.min(values[0], values[1]), high: Math.max(values[0], values[1]) };
  return { low: values[0], high: values[0] };
}

function zoneForWatts(watts: number, ftp: number) {
  const ratio = watts / Math.max(1, ftp);
  return POWER_ZONES.find(zone => ratio <= zone.max) ?? POWER_ZONES[POWER_ZONES.length - 1];
}

function WorkoutChart({ steps, ftp }: { steps: ChartStep[]; ftp: number }) {
  const valid = steps.filter(step => step.durationMinutes > 0);
  if (!valid.length) return null;
  const totalMinutes = valid.reduce((sum, step) => sum + step.durationMinutes, 0);
  const targets = valid.map(step => targetWatts(step.target, ftp));
  const maxWatts = Math.max(ftp * 1.5, ...targets.map(target => target.high * 1.08), 180);
  const width = 900, height = 300, left = 58, right = 16, top = 14, bottom = 42;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (minute: number) => left + (minute / totalMinutes) * plotWidth;
  const y = (watts: number) => top + plotHeight - (watts / maxWatts) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, i) => maxWatts * i / 4);
  let elapsed = 0;
  const segments = valid.map((step, index) => {
    const start = elapsed;
    elapsed += step.durationMinutes;
    const target = targets[index];
    const middle = (target.low + target.high) / 2;
    const zone = zoneForWatts(middle, ftp);
    return { step, start, end: elapsed, target, zone, middle };
  });
  const bands = POWER_ZONES.map((zone, index) => {
    const lower = index === 0 ? 0 : POWER_ZONES[index - 1].max * ftp;
    const upper = Math.min(maxWatts, zone.max * ftp);
    if (lower >= maxWatts || upper <= lower) return null;
    return <rect key={zone.name} x={left} y={y(upper)} width={plotWidth} height={Math.max(0, y(lower) - y(upper))} fill={zone.color} opacity="0.075" />;
  });
  return <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div><p className="text-sm font-semibold">Profil mocy treningu</p><p className="text-xs text-slate-500">Oś pozioma: czas · oś pionowa: moc docelowa</p></div>
      <div className="text-right"><p className="text-xs text-slate-500">FTP zawodnika</p><p className="font-semibold text-cyan-300">{ftp} W</p></div>
    </div>
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Wykres mocy treningu na ${totalMinutes} minut, FTP ${ftp} watów`} className="block w-full min-w-[620px]">
        {bands}
        {ticks.map((tick, index) => <g key={index}>
          <line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#475569" strokeOpacity="0.55" strokeDasharray="3 5" />
          <text x={left-9} y={y(tick)+4} fill="#94a3b8" fontSize="11" textAnchor="end">{Math.round(tick)} W</text>
        </g>)}
        {segments.map((segment, index) => {
          const x1 = x(segment.start), x2 = x(segment.end);
          const rectTop = y(segment.target.high);
          const rectBottom = y(segment.target.low);
          const rectHeight = Math.max(7, rectBottom - rectTop);
          const rectY = rectHeight === 7 && segment.target.high === segment.target.low ? rectTop - 3.5 : rectTop;
          return <g key={index}>
            <rect x={x1+1} y={rectY} width={Math.max(1,x2-x1-2)} height={rectHeight} rx="5" fill={segment.zone.color} opacity="0.88">
              <title>{segment.step.name}: {segment.step.target}, {segment.step.durationMinutes} min · {segment.zone.name} {segment.zone.label}</title>
            </rect>
            <line x1={x1+1} x2={x2-1} y1={y(segment.middle)} y2={y(segment.middle)} stroke="#f8fafc" strokeWidth="2" strokeOpacity="0.9" />
            {x2-x1 > 88 && <text x={(x1+x2)/2} y={Math.max(top+12,rectY-6)} fill="#e2e8f0" fontSize="11" textAnchor="middle">{segment.step.target}</text>}
            {index > 0 && <line x1={x1} x2={x1} y1={top} y2={top+plotHeight} stroke="#94a3b8" strokeOpacity="0.25" />}
            <text x={(x1+x2)/2} y={height-17} fill="#cbd5e1" fontSize="10" textAnchor="middle">{segment.step.name.length > 15 ? segment.step.name.slice(0,14)+"…" : segment.step.name}</text>
          </g>;
        })}
        <line x1={left} x2={width-right} y1={top+plotHeight} y2={top+plotHeight} stroke="#94a3b8" />
        <text x={left} y={height-3} fill="#64748b" fontSize="9">0 min</text>
        <text x={width-right} y={height-3} fill="#64748b" fontSize="9" textAnchor="end">{totalMinutes} min</text>
      </svg>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {POWER_ZONES.map(zone => <div key={zone.name} className="flex items-center gap-1.5 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: zone.color }} />{zone.name} · {zone.label}</div>)}
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {segments.map((segment,index) => <div key={index} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{segment.step.name}</p><p className="text-xs text-slate-500">{segment.step.durationMinutes} min · {segment.zone.name} {segment.zone.label}</p></div>
        <div className="shrink-0 text-right text-sm font-semibold text-cyan-300">{segment.step.target}</div>
      </div>)}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">Strefy mocy wyliczane z FTP metodą procentową (Z1–Z7). Wykres pokazuje zakresy z planu; przy celu „≤” widoczny jest cały przedział od 0 W do limitu. Rzeczywista moc może się różnić od celu.</p>
  </section>;
}

function downloadZwiftWorkout(result: CoachResponse) {
  const workout = result.decision.workout;
  if (!workout) return;

  const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const ftp = Math.max(1, result.athlete?.ftpW ?? 238);
  const nodes = workout.steps.filter(step => step.durationMinutes > 0).map(step => {
    const seconds = Math.round(step.durationMinutes * 60);
    const values = [...step.target.matchAll(/(\d+(?:\.\d+)?)/g)].map(match => Number(match[1])).filter(Number.isFinite);
    const lowWatts = values.length > 1 ? Math.min(values[0], values[1]) : values[0] ?? ftp * 0.5;
    const highWatts = values.length > 1 ? Math.max(values[0], values[1]) : values[0] ?? ftp * 0.5;
    const low = Math.max(0.35, Math.min(1.5, lowWatts / ftp));
    const high = Math.max(low, Math.min(1.5, highWatts / ftp));
    const name = step.name.toLowerCase();
    if (name.includes("rozgrzew")) return `<Warmup Duration="${seconds}" PowerLow="${low.toFixed(3)}" PowerHigh="${high.toFixed(3)}" />`;
    if (name.includes("schł") || name.includes("schlo")) return `<Cooldown Duration="${seconds}" PowerLow="${low.toFixed(3)}" PowerHigh="${high.toFixed(3)}" />`;
    const target = (low + high) / 2;
    return `<SteadyState Duration="${seconds}" Power="${target.toFixed(3)}" />`;
  }).join("\n    ");

  const date = result.date || new Date().toISOString().slice(0, 10);
  const title = `${workout.title} ${date}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>Kuba AI Cycling Coach</author>
  <name>${escapeXml(title.slice(0, 35))}</name>
  <description>${escapeXml(`${workout.title}. FTP: ${ftp} W. Power targets are exported as a percentage of FTP for Zwift ERG mode.`)}</description>
  <sportType>bike</sportType>
  <tags/>
  <workout>
    ${nodes}
  </workout>
</workout_file>`;

  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Kuba-Coach-${date}-${workout.type.toLowerCase()}.zwo`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
