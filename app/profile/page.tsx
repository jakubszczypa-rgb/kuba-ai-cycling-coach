"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string; name: string; age: number | null; height_cm: number | null;
  weight_kg: number | null; current_ftp_w: number | null; vo2max: number | null; primary_goal: string | null;
};

type Decision = {
  decision_date: string; decision: string; workout_type: string | null;
  duration_minutes: number | null; intensity: string | null; reasoning: string | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMessage, setStravaMessage] = useState("");

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    let { data: p } = await supabase.from("athlete_profile")
      .select("id,name,age,height_cm,weight_kg,current_ftp_w,vo2max,primary_goal")
      .eq("user_id", user.id).maybeSingle();

    if (!p) {
      const created = await supabase.from("athlete_profile")
        .insert({ user_id: user.id, name: "Kuba" })
        .select("id,name,age,height_cm,weight_kg,current_ftp_w,vo2max,primary_goal")
        .single();
      p = created.data;
    }

    if (p) {
      setProfile(p);
      const { data: d } = await supabase.from("coach_decisions")
        .select("decision_date,decision,workout_type,duration_minutes,intensity,reasoning")
        .eq("athlete_id", p.id).order("decision_date", { ascending: false }).limit(10);
      setDecisions(d ?? []);
    }

    try {
      const status = await fetch("/api/strava/status");
      if (status.ok) {
        const data = await status.json();
        setStravaConnected(Boolean(data.connected));
      }
    } catch {}

    setLoading(false);
  }

  useEffect(() => { loadProfile(); }, []);

  async function syncGarmin() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const response = await fetch("/api/garmin/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setSyncMessage(data?.error || "Synchronizacja Garmin nie powiodła się.");
        return;
      }
      setSyncMessage(`Garmin zsynchronizowany: ${data.activities ?? 0} treningów, ${data.health ?? 0} dni danych zdrowotnych.`);
    } catch {
      setSyncMessage("Nie udało się połączyć z usługą synchronizacji Garmin.");
    } finally {
      setSyncing(false);
    }
  }

  async function syncStrava() {
    setStravaSyncing(true);
    setStravaMessage("");
    try {
      const response = await fetch("/api/strava/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setStravaMessage(data?.error || "Synchronizacja Strava nie powiodła się.");
        return;
      }
      setStravaMessage(`Strava: ${data.activities ?? 0} jazd zapisanych z ${data.fetched ?? 0} pobranych aktywności.`);
    } catch {
      setStravaMessage("Nie udało się połączyć z usługą synchronizacji Strava.");
    } finally {
      setStravaSyncing(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("athlete_profile").update({
      name: profile.name.trim() || "Kuba",
      age: profile.age,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      current_ftp_w: profile.current_ftp_w,
      vo2max: profile.vo2max,
      primary_goal: profile.primary_goal?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);

    setMessage(error ? "Nie udało się zapisać profilu." : "Profil zapisany.");
    setSaving(false);
  }

  if (loading) return <main className="min-h-screen p-8 text-slate-300">Ładowanie profilu...</main>;
  if (!profile) return <main className="min-h-screen p-8"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6"><h1 className="text-2xl font-semibold">Brak profilu</h1><p className="mt-2 text-slate-400">Zaloguj się, aby utworzyć profil.</p></div></main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">ATHLETE PROFILE</p>
          <h1 className="mt-2 text-4xl font-semibold">{profile.name || "Kuba"}</h1>
          <p className="mt-2 text-slate-400">Profil zawodnika używany przez AI Coach.</p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold">Dane zawodnika</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Imię" value={profile.name} onChange={v => setProfile({...profile, name:v})} />
            <NumberField label="Wiek" value={profile.age} onChange={v => setProfile({...profile, age:v})} />
            <NumberField label="Wzrost (cm)" value={profile.height_cm} onChange={v => setProfile({...profile, height_cm:v})} />
            <NumberField label="Waga (kg)" value={profile.weight_kg} step="0.1" onChange={v => setProfile({...profile, weight_kg:v})} />
            <NumberField label="FTP (W)" value={profile.current_ftp_w} onChange={v => setProfile({...profile, current_ftp_w:v})} />
            <NumberField label="VO₂max" value={profile.vo2max} step="0.1" onChange={v => setProfile({...profile, vo2max:v})} />
          </div>
          <label className="mt-4 block text-sm text-slate-400">Główny cel</label>
          <textarea value={profile.primary_goal ?? ""} onChange={e => setProfile({...profile, primary_goal:e.target.value})}
            className="mt-2 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 outline-none" />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={saveProfile} disabled={saving} className="rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">
              {saving ? "Zapisywanie..." : "Zapisz profil"}
            </button>
            <button onClick={syncGarmin} disabled={syncing} className="rounded-xl border border-cyan-400 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-200 disabled:opacity-50">
              {syncing ? "Synchronizuję Garmin..." : "Synchronizuj Garmin"}
            </button>
            {message && <span className="text-sm text-slate-400">{message}</span>}
          </div>
          {syncMessage && <p className="mt-3 text-sm text-cyan-300">{syncMessage}</p>}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-orange-400">STRAVA</p>
              <h2 className="mt-2 text-xl font-semibold">Pełna historia treningów</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Strava będzie źródłem historii jazdy z ostatnich 180 dni, a Garmin zostaje źródłem danych regeneracji.
              </p>
            </div>
            {stravaConnected ? (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300">✓ Strava połączona</span>
                <button onClick={syncStrava} disabled={stravaSyncing} className="rounded-xl border border-orange-400 bg-orange-400/10 px-4 py-3 font-semibold text-orange-200 disabled:opacity-50">
                  {stravaSyncing ? "Synchronizuję..." : "Pobierz 180 dni"}
                </button>
              </div>
            ) : (
              <a href="/api/strava/connect" className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-400">
                Połącz ze Strava
              </a>
            )}
          </div>
          {stravaMessage && <p className="mt-4 text-sm text-orange-300">{stravaMessage}</p>}
          {!stravaConnected && <p className="mt-4 text-xs text-slate-500">Połączenie jest tylko do odczytu. Trener nie będzie publikował ani zmieniał aktywności na Strava.</p>}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="FTP" value={profile.current_ftp_w ? `${profile.current_ftp_w} W` : "—"} />
          <Metric label="VO₂max" value={profile.vo2max ? String(profile.vo2max) : "—"} />
          <Metric label="Wzrost" value={profile.height_cm ? `${profile.height_cm} cm` : "—"} />
          <Metric label="Waga" value={profile.weight_kg ? `${profile.weight_kg} kg` : "—"} />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold">Ostatnie decyzje coacha</h2>
          <div className="mt-4 space-y-3">
            {decisions.length === 0 ? <p className="text-slate-500">Brak decyzji — zrób pierwszy check-in.</p> : decisions.map((d, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-semibold">{d.decision}</span><span className="ml-3 text-sm text-slate-400">{d.decision_date}</span></div>
                  <span className="text-sm text-cyan-300">{d.workout_type ?? "REST"} · {d.duration_minutes ?? 0} min</span>
                </div>
                {d.reasoning && <p className="mt-2 text-sm leading-6 text-slate-400">{d.reasoning}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {
  return <label className="block text-sm text-slate-400">{label}<input value={value ?? ""} onChange={e=>onChange(e.target.value)}
    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none" /></label>;
}
function NumberField({label,value,onChange,step="1"}:{label:string;value:number|null;onChange:(v:number|null)=>void;step?:string}) {
  return <label className="block text-sm text-slate-400">{label}<input type="number" step={step} value={value ?? ""} onChange={e=>onChange(e.target.value===""?null:Number(e.target.value))}
    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none" /></label>;
}
function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
