"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateWorkout } from "@/lib/coach/workout-generator";

export default function WorkoutPage() {
  const [type, setType] = useState("ENDURANCE");
  const [minutes, setMinutes] = useState(60);
  const [ftp, setFtp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setMessage("Zaloguj się, aby używać swojego FTP."); return; }
        const { data, error } = await supabase.from("athlete_profile").select("current_ftp_w").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        if (!data) { setMessage("Brak profilu zawodnika. Uzupełnij go w zakładce Profil."); return; }
        setFtp(typeof data.current_ftp_w === "number" && data.current_ftp_w > 0 ? data.current_ftp_w : 238);
      } catch {
        setMessage("Nie udało się pobrać FTP z profilu.");
      } finally { setLoading(false); }
    }
    void loadProfile();
  }, []);

  const safeMinutes = Math.max(30, Math.min(240, Number.isFinite(minutes) ? minutes : 60));
  const workout = useMemo(() => ftp ? generateWorkout(type, safeMinutes, ftp) : null, [type, safeMinutes, ftp]);

  return <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
    <div className="mx-auto max-w-4xl space-y-6">
      <header><p className="text-sm uppercase tracking-[0.25em] text-cyan-400">WORKOUT BUILDER</p><h1 className="mt-2 text-4xl font-semibold">Kreator treningu</h1><p className="mt-2 text-slate-400">Cele mocy są wyliczane z aktualnego FTP zapisanego w profilu.</p></header>
      {loading ? <p className="text-slate-400">Pobieranie profilu…</p> : message && !ftp ? <div className="rounded-2xl border border-amber-800 bg-amber-950/30 p-4 text-amber-200">{message}<a href="/profile" className="ml-2 underline">Otwórz profil</a></div> : null}
      <section className="flex flex-wrap gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        {[["ENDURANCE","Wytrzymałość"],["RECOVERY","Regeneracja"],["SWEET_SPOT","Sweet Spot"]].map(([value,label]) => <button key={value} onClick={() => setType(value)} className={"rounded-xl px-4 py-2 " + (type === value ? "bg-white text-black" : "bg-slate-800")}>{label}</button>)}
        <label className="flex items-center gap-2">Czas <input className="w-24 rounded-lg bg-slate-800 p-2" type="number" min="30" max="240" step="15" value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
      </section>
      {workout && <section className="rounded-3xl border border-cyan-900 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">{workout.title}</h2>
        <p className="mt-1 text-slate-400">{workout.durationMinutes} min · FTP {ftp} W</p>
        <div className="mt-5 space-y-3">{workout.steps.map((s, i) => <div key={i} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[1fr_100px_1.5fr]"><b>{s.name}</b><span>{s.durationMinutes} min</span><span className="text-cyan-300">{s.target}</span><p className="sm:col-span-3 text-sm text-slate-400">{s.purpose}</p></div>)}</div>
      </section>}
    </div>
  </main>;
}
