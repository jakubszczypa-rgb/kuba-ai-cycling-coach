export type StravaStreams = Record<string, { data?: unknown[]; original_size?: number; resolution?: string }>;

export type StreamMetrics = {
  sampleCount: number;
  durationSec: number;
  coverage: { power: number; heartRate: number; paired: number };
  avgPowerW: number | null;
  avgHr: number | null;
  maxHr: number | null;
  maxPowerW: number | null;
  powerHrEfficiency: number | null;
  aerobicDecouplingPct: number | null;
  aerobicSamples: number;
  timeInPowerZonesSec: Record<string, number>;
  intervals: Array<{
    startSec: number; endSec: number; durationSec: number;
    avgPowerW: number; avgHr: number | null; maxHr: number | null;
    recoveryHrDropBpm: number | null;
  }>;
};

function nums(streams: StravaStreams, key: string): Array<number | null> {
  const raw = streams[key]?.data;
  if (!Array.isArray(raw)) return [];
  return raw.map(v => typeof v === "number" && Number.isFinite(v) ? v : null);
}

export function analyzeStravaStreams(streams: StravaStreams, ftpW: number): StreamMetrics {
  const time = nums(streams, "time");
  const watts = nums(streams, "watts");
  const hr = nums(streams, "heartrate");
  const n = Math.max(time.length, watts.length, hr.length);
  const pairs: Array<{ t: number; w: number; h: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = time[i] ?? i;
    const w = watts[i];
    const h = hr[i];
    if (w !== null && h !== null && w >= 0 && h > 0) pairs.push({ t, w, h });
  }
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const max = (xs: number[]) => xs.length ? Math.max(...xs) : null;
  const powerValues = watts.filter((v): v is number => v !== null);
  const hrValues = hr.filter((v): v is number => v !== null);
  const durationSec = time.length ? Number(time[time.length - 1] ?? 0) : n;
  const zones: Record<string, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0 };
  const bounds = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5].map(x => x * ftpW);
  for (let i = 0; i < watts.length; i++) {
    const w = watts[i];
    if (w === null) continue;
    const z = w < bounds[0] ? "z1" : w < bounds[1] ? "z2" : w < bounds[2] ? "z3" : w < bounds[3] ? "z4" : w < bounds[4] ? "z5" : w < bounds[5] ? "z6" : "z6";
    zones[z]++;
  }

  // Aerobic decoupling: compare power/HR efficiency in the first and second
  // halves of steady endurance riding (55-78% FTP), only when enough data exists.
  const aerobicSegments: typeof pairs[] = [];
  let currentSegment: typeof pairs = [];
  let previousTime: number | null = null;
  for (const point of pairs) {
    const inRange = point.w >= ftpW * 0.55 && point.w <= ftpW * 0.78;
    const continuous = previousTime === null || point.t - previousTime <= 3;
    if (inRange && continuous) currentSegment.push(point);
    else { if (currentSegment.length) aerobicSegments.push(currentSegment); currentSegment = inRange ? [point] : []; }
    previousTime = point.t;
  }
  if (currentSegment.length) aerobicSegments.push(currentSegment);
  const aerobic = aerobicSegments.sort((x, y) => y.length - x.length)[0] ?? [];
  let aerobicDecouplingPct: number | null = null;
  if (aerobic.length >= 600) {
    const midpoint = (aerobic[0].t + aerobic[aerobic.length - 1].t) / 2;
    const first = aerobic.filter(p => p.t <= midpoint);
    const second = aerobic.filter(p => p.t > midpoint);
    const p1 = avg(first.map(p => p.w)), h1 = avg(first.map(p => p.h));
    const p2 = avg(second.map(p => p.w)), h2 = avg(second.map(p => p.h));
    if (p1 && h1 && p2 && h2 && first.length >= 180 && second.length >= 180) aerobicDecouplingPct = Math.round(((p1 / h1 - p2 / h2) / (p1 / h1)) * 1000) / 10;
  }

  // Detect sustained work intervals from a 30-second rolling average above 88% FTP.
  const intervals: StreamMetrics["intervals"] = [];
  if (watts.length && hr.length) {
    const rolling: Array<number | null> = [];
    let sum = 0, count = 0;
    for (let i = 0; i < watts.length; i++) {
      const value = watts[i];
      if (value !== null) { sum += value; count++; }
      if (i >= 30) {
        const old = watts[i - 30];
        if (old !== null) { sum -= old; count--; }
      }
      rolling.push(i >= 29 && count >= 25 ? sum / count : null);
    }
    let start = -1;
    const candidates: Array<[number, number]> = [];
    for (let i = 0; i <= rolling.length; i++) {
      const active = i < rolling.length && (rolling[i] ?? 0) >= ftpW * 0.88;
      if (active && start < 0) start = i;
      if (!active && start >= 0) {
        if (i - start >= 45) candidates.push([start, i - 1]);
        start = -1;
      }
    }
    const merged: Array<[number, number]> = [];
    for (const interval of candidates) {
      const last = merged[merged.length - 1];
      if (last && interval[0] - last[1] <= 30) last[1] = interval[1];
      else merged.push([...interval]);
    }
    for (const [s, e] of merged) {
      const ws = watts.slice(s, e + 1).filter((v): v is number => v !== null);
      const hs = hr.slice(s, e + 1).filter((v): v is number => v !== null);
      const endHr = avg(hr.slice(Math.max(s, e - 9), e + 1).filter((v): v is number => v !== null));
      const recovery = hr.slice(e + 1, Math.min(hr.length, e + 121)).filter((v): v is number => v !== null);
      const recoveryMin = recovery.length ? Math.min(...recovery) : null;
      intervals.push({
        startSec: time[s] ?? s, endSec: time[e] ?? e, durationSec: (time[e] ?? e) - (time[s] ?? s) + 1,
        avgPowerW: Math.round(avg(ws) ?? 0), avgCadence: avg(cadence.slice(s, e + 1).filter((v): v is number => v !== null)), avgHr: avg(hs) === null ? null : Math.round(avg(hs)!),
        maxHr: max(hs) === null ? null : Math.round(max(hs)!),
        recoveryHrDropBpm: endHr !== null && recoveryMin !== null ? Math.round(endHr - recoveryMin) : null,
      });
    }
  }

  return {
    sampleCount: n,
    durationSec,
    coverage: {
      power: Math.round(powerValues.length / Math.max(1, n) * 100),
      heartRate: Math.round(hrValues.length / Math.max(1, n) * 100),
      paired: Math.round(pairs.length / Math.max(1, n) * 100),
    },
    avgPowerW: avg(powerValues) === null ? null : Math.round(avg(powerValues)!),
    avgHr: avg(hrValues) === null ? null : Math.round(avg(hrValues)!),
    maxHr: max(hrValues) === null ? null : Math.round(max(hrValues)!),
    maxPowerW: max(powerValues),
    powerHrEfficiency: avg(pairs.map(p => p.w)) && avg(pairs.map(p => p.h))
      ? Math.round((avg(pairs.map(p => p.w))! / avg(pairs.map(p => p.h))!) * 100) / 100 : null,
    aerobicDecouplingPct,
    aerobicSamples: aerobic.length,
    timeInPowerZonesSec: zones,
    intervals,
  };
}
