"use client";

import { useMemo, useState } from "react";

type Feeling = "great" | "good" | "average" | "tired" | "wrecked";
type TimeOption = 0 | 30 | 60 | 90 | 120 | 180;

const feelingLabels: Record<Feeling, string> = {
  great: "Bardzo dobrze",
  good: "Dobrze",
  average: "Średnio",
  tired: "Zmęczony",
  wrecked: "Zajechany",
};

export default function Home() {
  const [feeling, setFeeling] = useState<Feeling>("good");
  const [time, setTime] = useState<TimeOption>(60);
  const [nightShift, setNightShift] = useState(false);

  const recommendation = useMemo(() => {
    if (nightShift || feeling === "wrecked") {
      return {
        status: "REST",
        color: "danger",
        title: "Dzisiaj odpuszczamy mocny trening.",
        workout: time >= 30 ? "30–45 min bardzo lekkiego Z1/Z2 albo pełny odpoczynek" : "Pełny odpoczynek",
        reason: "Nocna zmiana lub bardzo niska energia ma pierwszeństwo przed planem treningowym.",
      };
    }

    if (feeling === "tired") {
      return {
        status: "EASY",
        color: "warning",
        title: "Lekki trening zamiast jakościowego bodźca.",
        workout: time >= 60 ? "45–60 min Z2" : time >= 30 ? "30 min Z1/Z2" : "Odpoczynek",
        reason: "Dane subiektywne wskazują na podwyższone zmęczenie.",
      };
    }

    if (time === 0) {
      return {
        status: "REST",
        color: "neutral",
        title: "Brak czasu na trening.",
        workout: "Odpoczynek — plan przesuniemy dynamicznie.",
        reason: "Dostępny czas jest ważnym ograniczeniem planu.",
      };
    }

    return {
      status: "TRAIN",
      color: "success",
      title: "Dzisiaj możemy trenować.",
      workout: time >= 120 ? "Endurance 2 h+" : time >= 90 ? "Endurance 75–90 min" : time >= 60 ? "Endurance 60 min" : "Krótki trening jakościowy lub Z2",
      reason: "Na ten moment nie ma sygnału, żeby odwoływać trening.",
    };
  }, [feeling, nightShift, time]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-400">KUBA AI CYCLING COACH</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Dzisiaj</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Pierwszy moduł przyszłego trenera: Twoje samopoczucie + dostępny czas + kontekst zmiany.
            </p>
          </div>
          <div className="hidden rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 sm:block">
            MVP 0.1
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">Decyzja trenera</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${recommendation.color === "danger" ? "bg-rose-400" : recommendation.color === "warning" ? "bg-amber-400" : recommendation.color === "success" ? "bg-emerald-400" : "bg-slate-400"}`} />
                  <span className="text-2xl font-semibold">{recommendation.status}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-wider text-slate-500">Dostępny czas</p>
                <p className="mt-1 text-xl font-semibold">{time === 0 ? "brak" : `${time} min`}</p>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold">{recommendation.title}</h2>
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-400">Rekomendowany trening</p>
                <p className="mt-2 text-lg font-medium">{recommendation.workout}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{recommendation.reason}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-medium text-slate-300">Jak się dzisiaj czujesz?</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(feelingLabels) as Feeling[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setFeeling(item)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm transition ${feeling === item ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"}`}
                    >
                      {feelingLabels[item]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium text-slate-300">Ile masz czasu?</p>
                <div className="grid grid-cols-3 gap-2">
                  {([0, 30, 60, 90, 120, 180] as TimeOption[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setTime(item)}
                      className={`rounded-xl border px-3 py-3 text-sm transition ${time === item ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"}`}
                    >
                      {item === 0 ? "0 min" : `${item} min`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <input
                type="checkbox"
                checked={nightShift}
                onChange={(e) => setNightShift(e.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
              <span>
                <span className="block text-sm font-medium">Jestem po / przed nocną zmianą</span>
                <span className="block text-xs text-slate-500">Docelowo ten kontekst pobierzemy z Twojego grafiku pracy.</span>
              </span>
            </label>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-sm text-slate-400">Profil celu</p>
              <h2 className="mt-2 text-xl font-semibold">Więcej mocy przy niższym HR</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="FTP" value="238 W" />
                <Metric label="VO₂max" value="44" />
                <Metric label="Cel zimowy" value="Endurance" />
                <Metric label="Coach mode" value="Dynamic" />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-sm text-slate-400">Co dalej</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>01 — podłączenie Garmin Personal API</li>
                <li>02 — baza treningów + zdrowia</li>
                <li>03 — engine fatigue / recovery</li>
                <li>04 — prawdziwa decyzja AI</li>
                <li>05 — dynamiczny plan 2–3 tygodnie</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
