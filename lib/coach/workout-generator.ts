export type WorkoutStep = {
  name: string;
  durationMinutes: number;
  target: string;
  purpose: string;
};

export type Workout = {
  title: string;
  type: string;
  durationMinutes: number;
  steps: WorkoutStep[];
};

export function generateWorkout(type: string, durationMinutes: number, ftpW: number): Workout {
  const z2 = Math.round(ftpW * 0.68);
  const z2High = Math.round(ftpW * 0.75);
  const sweetLow = Math.round(ftpW * 0.88);
  const sweetHigh = Math.round(ftpW * 0.94);
  const total = Math.max(30, durationMinutes);

  if (type === "RECOVERY") return {
    title: "Recovery Spin", type, durationMinutes: total,
    steps: [
      { name: "Rozgrzewka", durationMinutes: 10, target: "≤ " + z2 + " W", purpose: "Rozruszanie bez dokładania zmęczenia" },
      { name: "Lekka jazda", durationMinutes: total - 20, target: Math.round(ftpW * .50) + "–" + Math.round(ftpW * .65) + " W", purpose: "Regeneracja" },
      { name: "Schłodzenie", durationMinutes: 10, target: "≤ " + Math.round(ftpW * .50) + " W", purpose: "Spokojne zakończenie" }
    ]
  };

  if (type === "SWEET_SPOT" && total >= 60) {
    const work = Math.max(8, Math.floor((total - 25) / 2));
    return {
      title: "Sweet Spot 2×", type, durationMinutes: total,
      steps: [
        { name: "Rozgrzewka", durationMinutes: 15, target: Math.round(ftpW * .55) + "–" + Math.round(ftpW * .75) + " W", purpose: "Przygotowanie do pracy" },
        { name: "Sweet Spot", durationMinutes: work, target: sweetLow + "–" + sweetHigh + " W", purpose: "Budowa wytrzymałości siłowej" },
        { name: "Przerwa", durationMinutes: 5, target: "≤ " + z2 + " W", purpose: "Kontrolowana regeneracja" },
        { name: "Sweet Spot", durationMinutes: work, target: sweetLow + "–" + sweetHigh + " W", purpose: "Drugi jakościowy bodziec" },
        { name: "Schłodzenie", durationMinutes: total - (15 + work + 5 + work), target: "≤ " + Math.round(ftpW * .55) + " W", purpose: "Powrót do spokojnej pracy" }
      ]
    };
  }

  return {
    title: "Endurance", type: "ENDURANCE", durationMinutes: total,
    steps: [
      { name: "Rozgrzewka", durationMinutes: 10, target: Math.round(ftpW * .50) + "–" + z2 + " W", purpose: "Stopniowe wejście w wysiłek" },
      { name: "Endurance", durationMinutes: Math.max(10, total - 20), target: z2 + "–" + z2High + " W", purpose: "Budowa bazy tlenowej i poprawa efektywności" },
      { name: "Schłodzenie", durationMinutes: 10, target: "≤ " + Math.round(ftpW * .55) + " W", purpose: "Spokojne zakończenie" }
    ]
  };
}
