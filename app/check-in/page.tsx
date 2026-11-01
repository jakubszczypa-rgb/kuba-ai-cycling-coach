"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decideToday } from "@/lib/coach/decision";
import { adjustPlan } from "@/lib/coach/plan-adjuster";
import type { PlannedWorkout } from "@/lib/coach/plan-builder";

type Feeling = "great" | "good" | "average" | "tired" | "wrecked";

export default function CheckInPage() {
  const [feeling, setFeeling] = useState<Feeling>("good");
  const [minutes, setMinutes] = useState(60);
  const [nightShift, setNightShift] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const decision = decideToday({ feeling, availableMinutes: minutes, nightShift });

  async function saveCheckIn() {
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Zaloguj się, aby zapisać check-in.");
      setSaving(false);
      return;
    }

    let { data: profile } = await supabase
      .from("athlete_profile")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      const created = await supabase
        .from("athlete_profile")
        .insert({ user_id: user.id, name: "Kuba" })
        .select("id")
        .single();

      if (created.error) {
        setMessage("Nie udało się utworzyć profilu zawodnika.");
        setSaving(false);
        return;
      }
      profile = created.data;
    }

    const date = new Date().toISOString().slice(0, 10);

    const { error: statusError } = await supabase.from("daily_status").upsert({
      athlete_id: profile.id,
      date,
      feeling,
      available_minutes: minutes,
      night_shift: nightShift,
    }, { onConflict: "athlete_id,date" });

    if (statusError) {
      setMessage("Nie udało się zapisać check-inu.");
      setSaving(false);
      return;
    }

    const { error: decisionError } = await supabase.from("coach_decisions").insert({
      athlete_id: profile.id,
      decision_date: date,
      decision: decision.decision,
      intensity: decision.intensity,
      duration_minutes: decision.durationMinutes,
      workout_type: decision.workoutType,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      input_snapshot: { feeling, availableMinutes: minutes, nightShift },
    });

    // Load the current plan window and let the coach reschedule it.
    const { data: planRows, error: planLoadError } = await supabase
      .from("plan_days")
      .select("id,plan_date,title,workout_type,duration_minutes,priority,status")
      .eq("athlete_id", profile.id)
      .order("plan_date");

    let planError = !!planLoadError;
    let planAdjusted = false;

    if (!planLoadError && planRows?.length) {
      const plan: PlannedWorkout[] = planRows.map(row => ({
        id: row.id,
        date: row.plan_date,
        title: row.title,
        type: row.workout_type,
        durationMinutes: row.duration_minutes,
        priority: row.priority,
        status: row.status,
      }));

      const adjusted = adjustPlan({
        plan,
        date,
        feeling,
        availableMinutes: minutes,
        nightShift,
      });

      const changed = adjusted.filter((item, index) => {
        const before = plan[index];
        return before &&
          (before.date !== item.date ||
            before.title !== item.title ||
            before.type !== item.type ||
            before.durationMinutes !== item.durationMinutes ||
            before.priority !== item.priority ||
            before.status !== item.status);
      });

      if (changed.length) {
        const { error } = await supabase.from("plan_days").upsert(
          changed.map(item => ({
            id: item.id,
            athlete_id: profile.id,
            plan_date: item.date,
            title: item.title,
            workout_type: item.type,
            duration_minutes: item.durationMinutes,
            priority: item.priority,
            status: item.status,
          })),
          { onConflict: "athlete_id,plan_date" }
        );
        planError = !!error;
        planAdjusted = !error;
      }
    }

    if (decisionError) {
      setMessage("Check-in zapisany, ale nie udało się zapisać decyzji coacha.");
    } else if (planError) {
      setMessage("Check-in i decyzja coacha zapisane, ale nie udało się skorygować planu.");
    } else if (planAdjusted) {
      setMessage(
        decision.decision === "REST"
          ? "Check-in zapisany. Dzisiejszy trening został odwołany, a plan automatycznie przesunięty."
          : "Check-in zapisany. Coach automatycznie skorygował plan."
      );
    } else {
      setMessage("Check-in i decyzja coacha zapisane. Plan nie wymagał zmiany.");
    }

    setSaving(false);
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Dzisiejszy check-in</h1>
        <p className="text-zinc-400">Coach wykorzysta to razem z danymi Garmin.</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["great", "Bardzo dobrze"],
            ["good", "Dobrze"],
            ["average", "Średnio"],
            ["tired", "Zmęczony"],
            ["wrecked", "Zajechany"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFeeling(value as Feeling)}
              className={`rounded-xl border p-3 ${feeling === value ? "border-white bg-white text-black" : "border-zinc-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-2 block">Ile masz dziś czasu?</label>
          <select
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            className="rounded-xl border border-zinc-700 bg-zinc-900 p-3"
          >
            {[0, 30, 45, 60, 90, 120, 180].map(x => (
              <option key={x} value={x}>{x} min</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={nightShift}
            onChange={e => setNightShift(e.target.checked)}
          />
          Jestem po / przed nocną zmianą
        </label>

        <section className="rounded-2xl border border-zinc-700 p-5">
          <p className="text-sm text-zinc-400">Wstępna decyzja coacha</p>
          <h2 className="mt-2 text-2xl font-bold">{decision.decision}</h2>
          <p className="mt-1">{decision.workoutType} · {decision.durationMinutes} min · {decision.intensity}</p>
          <p className="mt-3 text-zinc-300">{decision.reasoning}</p>
        </section>

        <button
          onClick={saveCheckIn}
          className="rounded-xl bg-white px-5 py-3 font-semibold text-black"
        >
          {saving ? "Zapisywanie..." : "Zapisz check-in"}
        </button>

        {message && <p className="text-zinc-300">{message}</p>}
      </div>
    </main>
  );
}
