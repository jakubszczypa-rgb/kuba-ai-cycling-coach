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
  efficiencyTrend: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
  loadRatio7to28: number;
  hardSessions7d: number;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function loadFor(a: ActivitySample) {
  return a.tss ?? ((a.durationMinutes / 60) * 50);
}

export function analyzeTraining(activities: ActivitySample[]): TrainingAnalytics {
  const cutoff7 = daysAgo(7);
  const cutoff28 = daysAgo(28);
  const recent = activities.filter(a => new Date(a.date) >= cutoff7);
  const month = activities.filter(a => new Date(a.date) >= cutoff28);

  const efficiency = (list: ActivitySample[]) => {
    const pairs = list
      .filter(a => (a.avgPowerW ?? 0) > 0 && (a.avgHr ?? 0) > 0 && a.durationMinutes >= 30)
      .map(a => a.avgPowerW! / a.avgHr!);
    return pairs.length ? pairs.reduce((s, v) => s + v, 0) / pairs.length : null;
  };

  const recentEfficiency = efficiency(recent);
  const older = month.filter(a => new Date(a.date) < cutoff7);
  const olderEfficiency = efficiency(older);

  let efficiencyTrend: TrainingAnalytics["efficiencyTrend"] = "INSUFFICIENT_DATA";
  if (recentEfficiency !== null && olderEfficiency !== null) {
    const change = (recentEfficiency - olderEfficiency) / olderEfficiency;
    efficiencyTrend = change > 0.03 ? "IMPROVING" : change < -0.03 ? "DECLINING" : "STABLE";
  }

  const load7d = recent.reduce((s, a) => s + loadFor(a), 0);
  const load28d = month.reduce((s, a) => s + loadFor(a), 0);
  const hardSessions7d = recent.filter(a => {
    const tss = loadFor(a);
    return tss >= 60 || (a.avgPowerW ?? 0) > 0 && (a.avgPowerW! >= 0.88 * 238);
  }).length;

  return {
    load7d: Math.round(load7d),
    load28d: Math.round(load28d),
    hours7d: Math.round(recent.reduce((s, a) => s + a.durationMinutes / 60, 0) * 10) / 10,
    hours28d: Math.round(month.reduce((s, a) => s + a.durationMinutes / 60, 0) * 10) / 10,
    powerHrEfficiency: recentEfficiency ? Math.round(recentEfficiency * 100) / 100 : null,
    efficiencyTrend,
    loadRatio7to28: load28d ? Math.round((load7d / load28d) * 100) / 100 : 0,
    hardSessions7d,
  };
}
