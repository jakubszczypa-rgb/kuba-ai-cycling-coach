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

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: p } = await supabase.from("athlete_profile")
        .select("id,name,age,height_cm,weight_kg,current_ftp_w,vo2max,primary_goal")
        .eq("user_id", user.id).maybeSingle();

      if (p) {
        setProfile(p);
        const { data: d } = await supabase.from("coach_decisions")
          .select("decision_date,decision,workout_type,duration_minutes,intensity,reasoning")
          .eq("athlete_id", p.id).order("decision_date", { ascending: false }).limit(10);
        setDecisions(d ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <main className="min-h-screen p-8 text-slate-300">Ładowanie profilu...</main>;
  if (!profile) return <main className="min-h-screen p-8"><div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6"><h1 className="text-2xl font-semibold">Brak profilu</h1><p className="mt-2 text-slate-400">Zaloguj się i wykonaj pierwszy check-in.</p></div></main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">ATHLETE PROFILE</p><h1 className="mt-2 text-4xl font-semibold">{profile.name}</h1><p className="mt-2 text-slate-400">{profile.primary_goal ?? "Brak ustawionego celu"}</p></header>
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
function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
