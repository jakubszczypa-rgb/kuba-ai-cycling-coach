"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CheckInPage() {
  const [feeling, setFeeling] = useState("good");
  const [minutes, setMinutes] = useState(60);
  const [nightShift, setNightShift] = useState(false);
  const [message, setMessage] = useState("");

  async function saveCheckIn() {
    const supabase = createClient();
    const { error } = await supabase.from("daily_status").insert({
      date: new Date().toISOString().slice(0, 10),
      feeling,
      available_minutes: minutes,
      night_shift: nightShift,
    });

    setMessage(error ? "Nie udało się zapisać check-inu." : "Check-in zapisany.");
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Dzisiejszy check-in</h1>
        <p className="text-zinc-400">Coach wykorzysta to razem z danymi Garmin.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["great","Bardzo dobrze"],["good","Dobrze"],["average","Średnio"],
            ["tired","Zmęczony"],["wrecked","Zajechany"]
          ].map(([value,label]) => (
            <button key={value} onClick={() => setFeeling(value)}
              className={`rounded-xl border p-3 ${feeling === value ? "border-white bg-white text-black" : "border-zinc-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-2 block">Ile masz dziś czasu?</label>
          <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}
            className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
            {[0,30,45,60,90,120,180].map(x => <option key={x} value={x}>{x} min</option>)}
          </select>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={nightShift} onChange={e => setNightShift(e.target.checked)} />
          Jestem po / przed nocną zmianą
        </label>
        <button onClick={saveCheckIn} className="rounded-xl bg-white px-5 py-3 font-semibold text-black">
          Zapisz check-in
        </button>
        {message && <p className="text-zinc-300">{message}</p>}
      </div>
    </main>
  );
}
