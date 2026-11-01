export type ActivitySample = {
  date: string;
  durationMinutes: number;
  avgPowerW?: number | null;
  normalizedPowerW?: number | null;
  avgHr?: number | null;
  tss?: number | null;
};

export type TrainingAnalytics = {
  load7d: number;
  load28d: number;
  hours7d: number;
  hours28d: number;
  powerHrEfficiency: number | null;
  trend: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
};

export function analyzeTraining(activities: ActivitySample[]): TrainingAnalytics {
  const now = new Date();
  const cutoff7 = new Date(now); cutoff7.setDate(now.getDate() - 7);
  const cutoff28 = new Date(now); cutoff28.setDate(now.getDate() - 28);
  const recent = activities.filter(a => new Date(a.date) >= cutoff7);
  const month = activities.filter(a => new Date(a.date) >= cutoff28);

  const load = (a: ActivitySample) => a.tss ?? ((a.durationMinutes / 60) * 50);
  const hours = (a: ActivitySample) => a.durationMinutes / 60;
  const efficiencyPairs = activities
    .filter(a => (a.avgPowerW ?? 0) > 0 && (a.avgHr ?? 0) > 0)
    .map(a => (a.avgPowerW! / a.avgHr!));

  const efficiency = efficiencyPairs.length
    ? efficiencyPairs.reduce((s, v) => s + v, 0) / efficiencyPairs.length
    : null;

  return {
    load7d: Math.round(recent.reduce((s, a) => s + load(a), 0)),
    load28d: Math.round(month.reduce((s, a) => s + load(a), 0)),
    hours7d: Math.round(recent.reduce((s, a) => s + hours(a), 0) * 10) / 10,
    hours28d: Math.round(month.reduce((s, a) => s + hours(a), 0) * 10) / 10,
    powerHrEfficiency: efficiency ? Math.round(efficiency * 100) / 100 : null,
    trend: efficiencyPairs.length >= 3 ? "STABLE" : "INSUFFICIENT_DATA",
  };
}
