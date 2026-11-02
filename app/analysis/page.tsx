"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeTraining, type ActivitySample } from "@/lib/coach/analytics";
import StreamAnalysisPanel from "./stream-analysis-panel";

type ActivityRow = ActivitySample & { sport: string | null; source: "Strava" | "Garmin"; name?: string | null };
type HealthRow = { date: string; sleepMinutes: number; sleepScore: number | null; avgHr: number | null };

export default function AnalysisPage() {
  const [result, setResult] = useState<ReturnType<typeof analyzeTraining> | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [ftp, setFtp] = useState(238);
  const [message, setMessage] = useState("Ładowanie danych...");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage("Zaloguj się, aby zobaczyć analizę."); return; }

      const { data: profile } = await supabase.from("athlete_profile")
        .select("id,current_ftp_w").eq("user_id", user.id).maybeSingle();
      if (!profile) { setMessage("Brak profilu zawodnika."); return; }
      setFtp(profile.current_ftp_w ?? 238);

      const [{ data: stravaData, error: stravaError }, { data: garminData, error: garminError }, { data: healthData, error: healthError }] = await Promise.all([
        supabase.from("strava_activities").select("activity_start,duration_sec,avg_power_w,weighted_power_w,avg_hr,suffer_score,sport,name").eq("athlete_id", profile.id).order("activity_start", { ascending: false }).limit(500),
        supabase.from("garmin_activities").select("activity_start,duration_sec,avg_power_w,normalized_power_w,avg_hr,tss,sport").eq("athlete_id", profile.id).order("activity_start", { ascending: false }).limit(500),
        supabase.from("health_daily").select("date,sleep_minutes,raw_data").eq("athlete_id", profile.id).order("date", { ascending: false }).limit(31),
      ]);

      if (stravaError && garminError) { setMessage("Nie udało się pobrać treningów: " + (stravaError.message || garminError.message)); return; }
      if (healthError) console.warn("Garmin health:", healthError.message);

      const strava: ActivityRow[] = (stravaData ?? []).map((a: any) => ({
        date: a.activity_start, durationMinutes: (a.duration_sec ?? 0) / 60, avgPowerW: a.avg_power_w,
        normalizedPowerW: a.weighted_power_w, avgHr: a.avg_hr, tss: a.suffer_score, sport: a.sport,
        source: "Strava" as const, name: a.name,
      }));
      const garmin: ActivityRow[] = (garminData ?? []).map((a: any) => ({
        date: a.activity_start, durationMinutes: (a.duration_sec ?? 0) / 60, avgPowerW: a.avg_power_w,
        normalizedPowerW: a.normalized_power_w, avgHr: a.avg_hr, tss: a.tss, sport: a.sport,
        source: "Garmin" as const, name: null,
      }));

      // Strava is the main training history. Add Garmin-only activities so Garmin data is not lost.
      const merged = [...strava];
      for (const g of garmin) {
        const duplicate = strava.some(s => Math.abs(new Date(s.date).getTime() - new Date(g.date).getTime()) < 10 * 60 * 1000);
        if (!duplicate) merged.push(g);
      }
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(merged);
      setResult(analyzeTraining(merged, profile.current_ftp_w ?? 238));

      const parsedHealth = (healthData ?? []).map((h: any) => ({
        date: h.date,
        sleepMinutes: Number(h.sleep_minutes ?? 0),
        sleepScore: Number(h.raw_data?.sleepScores?.overall?.value ?? NaN),
        avgHr: Number(h.raw_data?.avgHeartRate ?? NaN),
      })).map((h: HealthRow) => ({
        ...h,
        sleepScore: Number.isFinite(h.sleepScore) ? h.sleepScore : null,
        avgHr: Number.isFinite(h.avgHr) ? h.avgHr : null,
      }));
      setHealth(parsedHealth);
      setMessage("");
    }
    load();
  }, []);

  const narrative = useMemo(() => buildNarrative(activities, health, ftp), [activities, health, ftp]);
  const weekly = useMemo(() => buildWeekly(activities), [activities]);

  if (!result) return <main className="min-h-screen bg-slate-950 p-8 text-slate-300">{message}</main>;

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">OSOBISTY TRENER</p>
        <h1 className="mt-2 text-4xl font-semibold">Moja forma</h1>
        <p className="mt-2 text-slate-400">Analiza treningów z Garmin Connect (FIT) i danych regeneracyjnych; Strava uzupełnia brakujące aktywności.</p>
      </header>

      <section className="rounded-3xl border border-cyan-900/60 bg-slate-900/80 p-6">
        <p className="text-sm uppercase tracking-wider text-cyan-400">Opis trenera</p>
        <h2 className="mt-2 text-2xl font-semibold">{narrative.headline}</h2>
        <p className="mt-4 leading-7 text-slate-300">{narrative.body}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Mini label="Treningi" value={String(activities.length)} />
          <Mini label="Okres" value={activities.length ? `${daysBetween(activities.at(-1)!.date, activities[0].date)} dni` : "—"} />
          <Mini label="FTP" value={`${ftp} W`} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Forma" value={result.trainingStatus === "BUILDING" ? "Rośnie ↗" : result.trainingStatus === "FATIGUED" ? "Zmęczenie ↓" : result.trainingStatus === "STABLE" ? "Stabilna →" : "Mało danych"} />
        <Metric label="Form Score" value={result.formScore !== null ? `${result.formScore}/100` : "—"} />
        <Metric label="Load 7d" value={String(result.load7d)} />
        <Metric label="Godziny 7d" value={`${result.hours7d} h`} />
        <Metric label="Mocne 7d" value={String(result.hardSessions7d)} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tygodniowy czas treningu" subtitle="Godziny z ostatnich 12 tygodni">
          <Bars data={weekly.slice(-12).map(x => ({ label: x.label, value: x.hours }))} suffix=" h" />
        </ChartCard>
        <ChartCard title="Średnia moc i tętno" subtitle="Dwa osobne słupki na tydzień; wartości opisane po najechaniu">
          <div className="mb-3 flex gap-4 text-xs text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-500"/> Moc (W)</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500"/> Tętno (bpm)</span></div>
          <DualBars data={weekly.slice(-12).map(x => ({ label: x.label, a: x.avgPower, b: x.avgHr }))} />
        </ChartCard>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Garmin — regeneracja</h2>
        <p className="mt-2 text-slate-400">To są dane pobrane bezpośrednio z Garmina. Obecnie mamy historię snu z ostatnich 31 dni; Garmin API udostępnia tu krótsze okno niż Strava dla treningów.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sen" subtitle="Minuty snu z ostatnich dni">
            <Bars data={[...health].reverse().slice(-14).map(x => ({ label: x.date.slice(5), value: Math.round(x.sleepMinutes / 60 * 10) / 10 }))} suffix=" h" />
          </ChartCard>
          <ChartCard title="Garmin Sleep Score" subtitle="Ocena snu zapisana w danych Garmina">
            <Bars data={[...health].reverse().slice(-14).map(x => ({ label: x.date.slice(5), value: x.sleepScore ?? 0 }))} suffix="" />
          </ChartCard>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Mini label="Dni Garmina" value={String(health.length)} />
          <Mini label="Ostatni sen" value={health[0] ? `${Math.floor(health[0].sleepMinutes / 60)}h ${health[0].sleepMinutes % 60}m` : "—"} />
          <Mini label="Ostatni Sleep Score" value={health[0]?.sleepScore != null ? String(health[0].sleepScore) : "—"} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Efektywność Power / HR</h2>
        <p className="mt-2 text-slate-300">{result.efficiencyTrend === "INSUFFICIENT_DATA" ? "Za mało porównywalnych treningów." : result.efficiencyTrend === "IMPROVING" ? "Trend jest poprawiający się — przy podobnym tętnie uzyskujesz więcej mocy." : result.efficiencyTrend === "DECLINING" ? "Trend spada — trzeba patrzeć na regenerację, obciążenie i jakość treningów." : "Trend jest stabilny."}</p>
      </section>

      <StreamAnalysisPanel />

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Ostatnie treningi</h2>
        <div className="mt-4 space-y-2">
          {activities.slice(0, 12).map((a, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div><p className="font-medium">{a.name || a.sport || "Training"}</p><p className="text-sm text-slate-500">{new Date(a.date).toLocaleString("pl-PL")} · {a.source}</p></div>
              <div className="text-sm text-slate-300">{Math.round(a.durationMinutes)} min · {a.avgPowerW ? Math.round(a.avgPowerW) + " W" : "— W"} · {a.avgHr ? Math.round(a.avgHr) + " bpm" : "— bpm"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  </main>;
}

function buildWeekly(rows: ActivityRow[]) {
  const map = new Map<string, { hours: number; powers: number[]; hrs: number[] }>();
  for (const r of rows) {
    const d = new Date(r.date); const day = d.getUTCDay(); const diff = (day + 6) % 7;
    const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - diff);
    const key = monday.toISOString().slice(0,10);
    const item = map.get(key) ?? { hours: 0, powers: [], hrs: [] };
    item.hours += r.durationMinutes / 60;
    if (r.avgPowerW != null) item.powers.push(Number(r.avgPowerW));
    if (r.avgHr != null) item.hrs.push(Number(r.avgHr));
    map.set(key, item);
  }
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,v])=>({
    label: label.slice(5), hours: Math.round(v.hours*10)/10,
    avgPower: v.powers.length ? Math.round(v.powers.reduce((a,b)=>a+b,0)/v.powers.length) : 0,
    avgHr: v.hrs.length ? Math.round(v.hrs.reduce((a,b)=>a+b,0)/v.hrs.length) : 0
  }));
}

function buildNarrative(rows: ActivityRow[], health: HealthRow[], ftp: number) {
  if (!rows.length) return { headline: "Czekam na treningi", body: "Brak danych treningowych do oceny." };
  const now = new Date(rows[0].date).getTime();
  const recent = rows.filter(r => now - new Date(r.date).getTime() <= 90*86400000);
  const previous = rows.filter(r => now - new Date(r.date).getTime() > 90*86400000 && now - new Date(r.date).getTime() <= 180*86400000);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  const rp = avg(recent.map(x=>Number(x.avgPowerW)).filter(Number.isFinite));
  const pp = avg(previous.map(x=>Number(x.avgPowerW)).filter(Number.isFinite));
  const rh = avg(recent.map(x=>Number(x.avgHr)).filter(Number.isFinite));
  const ph = avg(previous.map(x=>Number(x.avgHr)).filter(Number.isFinite));
  const sleepRecent = health.slice(0,7).map(x=>x.sleepMinutes).filter(x=>x>0);
  const sleepAvg = avg(sleepRecent);
  const powerChange = rp && pp ? Math.round((rp/pp-1)*100) : null;
  const hrChange = rh && ph ? Math.round((rh/ph-1)*100) : null;
  const efficiency = rp && rh && pp && ph ? Math.round(((rp/rh)/(pp/ph)-1)*100) : null;
  const headline = efficiency !== null && efficiency > 3 ? "Wygląda na to, że forma idzie w górę." : efficiency !== null && efficiency < -3 ? "Ostatnie tygodnie wyglądają na słabsze." : "Forma jest obecnie raczej stabilna.";
  const parts = [
    `Na podstawie ${rows.length} treningów trener porównuje teraz ostatnie 90 dni (${recent.length} jednostek) z poprzednimi 90 dniami (${previous.length} jednostek).`,
    powerChange !== null ? `Średnia moc z ostatnich 90 dni zmieniła się o ${powerChange > 0 ? "+" : ""}${powerChange}% względem poprzednich 90 dni${hrChange !== null ? `, przy zmianie średniego HR o ${hrChange > 0 ? "+" : ""}${hrChange}%` : ""}.` : "Dla części treningów brakuje porównywalnej mocy, więc trend mocy trzeba traktować ostrożnie.",
    efficiency !== null ? `Wskaźnik mocy względem HR zmienił się o ${efficiency > 0 ? "+" : ""}${efficiency}%. To jest obecnie najważniejszy sygnał wydolności tlenowej w tej analizie.` : "",
    sleepAvg ? `Garmin pokazuje średnio około ${Math.round(sleepAvg/6)/10} h snu na noc w ostatnich 7 dniach — ten sygnał będzie uwzględniany przy decyzji o intensywności.` : "",
    `FTP używany przez trenera: ${ftp} W. Sam wynik FTP nie jest jeszcze automatycznie podnoszony tylko dlatego, że pojedynczy trening był mocny.`
  ].filter(Boolean);
  return { headline, body: parts.join(" ") };
}

function daysBetween(a:string,b:string){ return Math.max(1, Math.round(Math.abs(new Date(b).getTime()-new Date(a).getTime())/86400000)+1); }

function Bars({data,suffix}:{data:{label:string;value:number}[];suffix:string}) {
  const max=Math.max(...data.map(x=>x.value),1);
  return <div className="flex h-44 items-end gap-1">{data.map((x,i)=><div key={i} className="flex h-full flex-1 flex-col justify-end"><div title={`${x.label}: ${x.value}${suffix}`} className="rounded-t bg-cyan-500/70" style={{height:`${Math.max(3,x.value/max*100)}%`}}/><span className="mt-1 truncate text-center text-[9px] text-slate-500">{x.label}</span></div>)}</div>;
}
function DualBars({data}:{data:{label:string;a:number;b:number}[]}) {
  const max=Math.max(...data.flatMap(x=>[x.a,x.b]),1);
  return <div className="flex h-44 items-end gap-1">{data.map((x,i)=><div key={i} className="flex h-full flex-1 items-end gap-0.5"><div title={`${x.label}: ${x.a} W`} className="w-1/2 rounded-t bg-cyan-500/70" style={{height:`${Math.max(3,x.a/max*100)}%`}}/><div title={`${x.label}: ${x.b} bpm`} className="w-1/2 rounded-t bg-amber-500/70" style={{height:`${Math.max(3,x.b/max*100)}%`}}/><span className="absolute"/></div>)}</div>;
}
function ChartCard({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-5">{children}</div></div>;
}
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function Mini({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
