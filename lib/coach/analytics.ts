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
  loadEstimated: boolean;
  hours7d: number;
  hours28d: number;
  powerHrEfficiency: number | null;
  efficiencyTrend: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
  loadRatio7to28: number;
  hardSessions7d: number;
  trainingStatus: "BUILDING" | "STABLE" | "FATIGUED" | "INSUFFICIENT_DATA";
  formScore: number | null;
  efficiencyChangePct: number | null;
  avgPower7d: number | null;
  avgHr7d: number | null;
  consistency7d: number;
  powerHrSessions7d: number;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function loadFor(a: ActivitySample) {
  // Garmin/Strava TSS is preferred. Duration-based load is an estimate, never presented as measured TSS.
  return typeof a.tss === "number" && Number.isFinite(a.tss) && a.tss >= 0
    ? a.tss
    : Math.max(0, a.durationMinutes) * 50 / 60;
}

export function analyzeTraining(activities: ActivitySample[], ftpW = 238): TrainingAnalytics {
  const cutoff7 = daysAgo(7);
  const cutoff28 = daysAgo(28);
  const valid = activities.filter(a => Number.isFinite(new Date(a.date).getTime()) && Number.isFinite(a.durationMinutes) && a.durationMinutes > 0);
  const recent = valid.filter(a => new Date(a.date) >= cutoff7);
  const month = valid.filter(a => new Date(a.date) >= cutoff28);

  const paired = (list: ActivitySample[]) => list.filter(a =>
    typeof a.avgPowerW === "number" && a.avgPowerW > 0 &&
    typeof a.avgHr === "number" && a.avgHr > 0 && a.durationMinutes >= 30
  );
  const efficiency = (list: ActivitySample[]) => {
    const pairs = paired(list).map(a => a.avgPowerW! / a.avgHr!);
    return pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : null;
  };

  const recentEfficiency = efficiency(recent);
  const olderEfficiency = efficiency(month.filter(a => new Date(a.date) < cutoff7));
  let efficiencyTrend: TrainingAnalytics["efficiencyTrend"] = "INSUFFICIENT_DATA";
  if (recentEfficiency !== null && olderEfficiency !== null && olderEfficiency > 0) {
    const change = (recentEfficiency - olderEfficiency) / olderEfficiency;
    efficiencyTrend = change > 0.03 ? "IMPROVING" : change < -0.03 ? "DECLINING" : "STABLE";
  }

  const load7d = recent.reduce((sum, a) => sum + loadFor(a), 0);
  const load28d = month.reduce((sum, a) => sum + loadFor(a), 0);
  const hardSessions7d = recent.filter(a => {
    if (typeof a.tss === "number" && Number.isFinite(a.tss)) return a.tss >= 60;
    return typeof a.avgPowerW === "number" && a.avgPowerW >= 0.88 * ftpW && a.durationMinutes >= 20;
  }).length;

  const efficiencyChangePct = recentEfficiency !== null && olderEfficiency !== null && olderEfficiency > 0
    ? Math.round(((recentEfficiency - olderEfficiency) / olderEfficiency) * 1000) / 10
    : null;
  const powerRows = recent.filter(a => typeof a.avgPowerW === "number" && a.avgPowerW > 0);
  const hrRows = recent.filter(a => typeof a.avgHr === "number" && a.avgHr > 0);
  const avgPower7d = powerRows.length ? Math.round(powerRows.reduce((sum, a) => sum + a.avgPowerW!, 0) / powerRows.length) : null;
  const avgHr7d = hrRows.length ? Math.round(hrRows.reduce((sum, a) => sum + a.avgHr!, 0) / hrRows.length) : null;
  const consistency7d = Math.min(100, Math.round((recent.length / 4) * 100));
  const loadRatio = load28d ? load7d / load28d : 0;
  const loadEstimated = [...recent, ...month.filter(a => !recent.includes(a))].some(a => typeof a.tss !== "number" || !Number.isFinite(a.tss));
  let trainingStatus: TrainingAnalytics["trainingStatus"] = "INSUFFICIENT_DATA";
  let formScore: number | null = null;
  if (month.length >= 3) {
    const efficiencyScore = efficiencyChangePct === null ? 50 : Math.max(0, Math.min(100, 50 + efficiencyChangePct * 5));
    const loadScore = loadRatio > 0.55 ? 35 : loadRatio > 0.4 ? 55 : loadRatio >= 0.2 ? 75 : 45;
    const intensityScore = hardSessions7d >= 4 ? 35 : hardSessions7d === 3 ? 55 : 75;
    formScore = Math.round(efficiencyScore * 0.45 + loadScore * 0.25 + intensityScore * 0.2 + consistency7d * 0.1);
    trainingStatus = formScore >= 70 ? "BUILDING" : formScore >= 52 ? "STABLE" : "FATIGUED";
  }

  return {
    load7d: Math.round(load7d),
    load28d: Math.round(load28d),
    loadEstimated,
    hours7d: Math.round(recent.reduce((sum, a) => sum + a.durationMinutes / 60, 0) * 10) / 10,
    hours28d: Math.round(month.reduce((sum, a) => sum + a.durationMinutes / 60, 0) * 10) / 10,
    powerHrEfficiency: recentEfficiency ? Math.round(recentEfficiency * 100) / 100 : null,
    efficiencyTrend,
    loadRatio7to28: load28d ? Math.round((load7d / load28d) * 100) / 100 : 0,
    hardSessions7d,
    trainingStatus,
    formScore,
    efficiencyChangePct,
    avgPower7d,
    avgHr7d,
    consistency7d,
    powerHrSessions7d: paired(recent).length,
  };
}
