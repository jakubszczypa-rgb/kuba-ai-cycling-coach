"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPlan } from "@/lib/coach/plan-builder";

type ScheduleDay = {
  date: string;
  shift_type: string;
  night_shift: boolean;
  available_minutes: number;
  notes: string;
};

function makeSchedule(): ScheduleDay[] {
  return Array.from({ length: 21 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), shift_type: "OFF", night_shift: false, available_minutes: 90, notes: "" };
  });
}

export default function PlanPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDay[]>(makeSchedule());
  const [message, setMessage] = useState("Ładowanie...");
  const [saving, setSaving] = useState(false);

  async function getProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
    return profile?.id ?? null;
  }

  async function load() {
    const supabase = createClient();
    const athleteId = await getProfile();
    if (!athleteId) { setMessage("Zaloguj się i utwórz profil zawodnika."); return; }

    const [planResult, scheduleResult] = await Promise.all([
      supabase.from("plan_days").select("*").eq("athlete_id", athleteId).order("plan_date"),
      supabase.from("work_schedule").select("date,shift_type,night_shift,available_minutes,notes").eq("athlete_id", athleteId).order("date"),
    ]);

    setRows(planResult.data ?? []);
    if (scheduleResult.data?.length) {
      setSchedule(current => current.map(day => {
        const saved = scheduleResult.data.find(row => row.date === day.date);
        return saved ? {
          date: day.date,
          shift_type: saved.shift_type ?? "OFF",
          night_shift: !!saved.night_shift,
          available_minutes: saved.available_minutes ?? 0,
          notes: saved.notes ?? "",
        } : day;
      }));
    }
    setMessage(planResult.data?.length ? "" : "Plan nie jest jeszcze zapisany.");
  }

  useEffect(() => { load(); }, []);

  function updateSchedule(index: number, patch: Partial<ScheduleDay>) {
    setSchedule(current => current.map((day, i) => i === index ? { ...day, ...patch } : day));
  }

  async function saveSchedule() {
    setSaving(true);
    const supabase = createClient();
    const athleteId = await getProfile();
    if (!athleteId) { setMessage("Zaloguj się."); setSaving(false); return; }

    const { error } = await supabase.from("work_schedule").upsert(
      schedule.map(day => ({
        athlete_id: athleteId,
        date: day.date,
        shift_type: day.shift_type,
        night_shift: day.night_shift,
        available_minutes: day.available_minutes,
        notes: day.notes || null,
      })),
      { onConflict: "athlete_id,date" }
    );

    setSaving(false);
    setMessage(error ? "Nie udało się zapisać grafiku." : "Grafik zapisany. Teraz wygeneruj plan na jego podstawie.");
  }

  async function generateAndSave() {
    setSaving(true);
    const supabase = createClient();
    const athleteId = await getProfile();
    if (!athleteId) { setMessage("Zaloguj się."); setSaving(false); return; }

    const days = schedule.slice(0, 14).map(day => ({
      date: day.date,
      availableMinutes: day.available_minutes,
      nightShift: day.night_shift,
    }));

    const plan = buildPlan(days[0].date, days, 238);
    const payload = plan.map(p => ({
      athlete_id: athleteId,
      plan_date: p.date,
      title: p.title,
      workout_type: p.type,
      duration_minutes: p.durationMinutes,
      priority: p.priority,
      status: p.status,
    }));

    const { error } = await supabase.from("plan_days").upsert(payload, { onConflict: "athlete_id,plan_date" });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Plan zaktualizowany na podstawie grafiku.");
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">ADAPTIVE COACH</p>
          <h1 className="mt-2 text-4xl font-semibold">Grafik + plan treningowy</h1>
          <p className="mt-2 text-slate-400">Wpisuj zmiany i dostępny czas na bieżąco. Coach użyje tego do aktualizacji planu.</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Mój grafik — najbliższe 21 dni</h2>
          {schedule.map((day, index) => (
            <div key={day.date} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[110px_150px_120px_100px_1fr] md:items-center">
              <strong>{day.date}</strong>
              <select value={day.shift_type} onChange={e => updateSchedule(index, {
                shift_type: e.target.value,
                night_shift: e.target.value === "NIGHT",
                available_minutes: e.target.value === "NIGHT" ? 0 : day.available_minutes,
              })} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                <option value="OFF">Wolne</option>
                <option value="DAY">Dzień</option>
                <option value="NIGHT">Nocka</option>
                <option value="OTHER">Inna</option>
              </select>
              <select value={day.available_minutes} onChange={e => updateSchedule(index, { available_minutes: Number(e.target.value) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                {[0,30,45,60,75,90,120,150,180,240].map(x => <option key={x} value={x}>{x} min</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={day.night_shift} onChange={e => updateSchedule(index, { night_shift: e.target.checked, available_minutes: e.target.checked ? 0 : day.available_minutes })} />
                Nocka
              </label>
              <input value={day.notes} onChange={e => updateSchedule(index, { notes: e.target.value })} placeholder="np. po nocce" className="rounded-lg border border-slate-700 bg-slate-950 p-2" />
            </div>
          ))}
          <div className="flex gap-3">
            <button disabled={saving} onClick={saveSchedule} className="rounded-xl border border-cyan-400 px-5 py-3 font-semibold text-cyan-300 disabled:opacity-50">
              Zapisz grafik
            </button>
            <button disabled={saving} onClick={generateAndSave} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black disabled:opacity-50">
              {saving ? "Aktualizowanie..." : "Aktualizuj plan z grafiku"}
            </button>
          </div>
        </section>

        {message && <p className="text-sm text-slate-400">{message}</p>}

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Plan na 14 dni</h2>
          {rows.map(p => (
            <div key={p.id} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[120px_1fr_120px_110px]">
              <span className="text-slate-400">{p.plan_date}</span>
              <div><b>{p.title}</b><p className="text-sm text-slate-500">{p.priority}</p></div>
              <span className="text-cyan-300">{p.duration_minutes} min</span>
              <span>{p.workout_type}</span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
