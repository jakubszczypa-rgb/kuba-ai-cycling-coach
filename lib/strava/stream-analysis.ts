export type StravaStreams = Record<string, { data?: unknown[]; original_size?: number; resolution?: string }>;

export type NormalizedSample = {
  t: number;
  powerW: number | null;
  hrBpm: number | null;
  cadenceRpm: number | null;
  speedMps: number | null;
  tempC: number | null;
  gradePct: number | null;
};

export type StreamMetrics = {
  sampleCount: number;
  durationSec: number;
  coverage: { power: number; heartRate: number; paired: number };
  dataQuality: { score: number; flags: string[]; timebase: "time_stream" | "index_fallback" };
  avgPowerW: number | null;
  avgHr: number | null;
  maxHr: number | null;
  maxPowerW: number | null;
  avgCadence: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgTempC: number | null;
  avgGradePct: number | null;
  powerHrEfficiency: number | null;
  aerobicDecouplingPct: number | null;
  aerobicSamples: number;
  timeInPowerZonesSec: Record<string, number>;
  timeline30s: Array<{ t: number; powerW: number | null; hrBpm: number | null; cadenceRpm: number | null }>;
  intervals: Array<{
    startSec: number; endSec: number; durationSec: number;
    avgPowerW: number; avgCadence: number | null; avgHr: number | null; maxHr: number | null;
    recoveryHrDropBpm: number | null; recoveryHrDrop30s: number | null;
    recoveryHrDrop60s: number | null; recoveryHrDrop120s: number | null;
    recoveryType: "active" | "passive" | "unknown";
    intensity: "endurance" | "tempo" | "sweet_spot" | "threshold" | "vo2max" | "anaerobic";
  }>;
};

const asNumbers = (streams: StravaStreams, key: string): Array<number | null> => {
  const raw = streams[key]?.data;
  if (!Array.isArray(raw)) return [];
  return raw.map(v => typeof v === "number" && Number.isFinite(v) ? v : null);
};
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const maximum = (values: number[]) => values.length ? Math.max(...values) : null;
const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * Strava streams are indexed against the time stream. We only pair a stream
 * with time when lengths match; a mismatched stream is marked unavailable
 * instead of silently pairing unrelated samples. No synthetic power is created.
 */
export function normalizeStravaStreams(streams: StravaStreams): NormalizedSample[] {
  const time = asNumbers(streams, "time");
  const hasTime = time.length > 0;
  const base = hasTime ? time : Array.from({ length: Math.max(...["watts", "heartrate", "cadence", "velocity_smooth"].map(k => asNumbers(streams, k).length), 0) }, (_, i) => i);
  const aligned = (key: string) => {
    const values = asNumbers(streams, key);
    return values.length === base.length ? values : [];
  };
  const watts = aligned("watts"), hr = aligned("heartrate"), cadence = aligned("cadence");
  const speed = aligned("velocity_smooth"), temp = aligned("temp"), grade = aligned("grade_smooth");
  return base.map((t, i) => ({
    t,
    powerW: watts[i] !== undefined && watts[i]! >= 0 ? watts[i] : null,
    hrBpm: hr[i] !== undefined && hr[i]! > 0 ? hr[i] : null,
    cadenceRpm: cadence[i] !== undefined && cadence[i]! >= 0 ? cadence[i] : null,
    speedMps: speed[i] !== undefined && speed[i]! >= 0 ? speed[i] : null,
    tempC: temp[i] ?? null,
    gradePct: grade[i] ?? null,
  })).filter((p, i, all) => Number.isFinite(p.t) && (i === 0 || p.t > all[i - 1].t));
}

/** Convert irregular time samples to a 1 Hz grid. Missing values remain null. */
export function resampleToOneHz(samples: NormalizedSample[]): NormalizedSample[] {
  if (!samples.length) return [];
  const start = Math.ceil(samples[0].t), end = Math.floor(samples[samples.length - 1].t);
  const result: NormalizedSample[] = [];
  let cursor = 0;
  for (let t = start; t <= end; t++) {
    while (cursor + 1 < samples.length && samples[cursor + 1].t <= t + 0.5) cursor++;
    const sample = samples[cursor];
    const closeEnough = Math.abs(sample.t - t) <= 1;
    result.push({
      t,
      powerW: closeEnough ? sample.powerW : null,
      hrBpm: closeEnough ? sample.hrBpm : null,
      cadenceRpm: closeEnough ? sample.cadenceRpm : null,
      speedMps: closeEnough ? sample.speedMps : null,
      tempC: closeEnough ? sample.tempC : null,
      gradePct: closeEnough ? sample.gradePct : null,
    });
  }
  return result;
}

function durationWeight(samples: NormalizedSample[], index: number): number {
  if (index + 1 < samples.length) return Math.max(0, Math.min(5, samples[index + 1].t - samples[index].t));
  return index > 0 ? Math.max(0, Math.min(5, samples[index].t - samples[index - 1].t)) : 1;
}

function classifyIntensity(power: number, ftp: number): StreamMetrics["intervals"][number]["intensity"] {
  const pct = power / ftp;
  if (pct > 1.2) return "anaerobic";
  if (pct >= 1.06) return "vo2max";
  if (pct >= 0.98) return "threshold";
  if (pct >= 0.84) return "sweet_spot";
  if (pct >= 0.76) return "tempo";
  return "endurance";
}

export function analyzeStravaStreams(streams: StravaStreams, ftpW: number): StreamMetrics {
  const validFtp = Number.isFinite(ftpW) && ftpW > 0 ? ftpW : 238;
  const rawTime = asNumbers(streams, "time");
  const original = normalizeStravaStreams(streams);
  const samples = resampleToOneHz(original);
  const flags: string[] = [];
  if (!rawTime.length) flags.push("TIME_STREAM_MISSING_INDEX_FALLBACK");
  if (rawTime.length && original.length !== rawTime.length) flags.push("NON_MONOTONIC_TIME_REMOVED");
  const rawPower = asNumbers(streams, "watts");
  const rawHr = asNumbers(streams, "heartrate");
  if (rawPower.length && rawPower.length !== rawTime.length) flags.push("POWER_STREAM_LENGTH_MISMATCH");
  if (rawHr.length && rawHr.length !== rawTime.length) flags.push("HR_STREAM_LENGTH_MISMATCH");
  const powerValues = samples.flatMap(s => s.powerW === null ? [] : [s.powerW]);
  const hrValues = samples.flatMap(s => s.hrBpm === null ? [] : [s.hrBpm]);
  const paired = samples.filter(s => s.powerW !== null && s.hrBpm !== null);
  const positivePairs = paired.filter(s => s.powerW! > 0);
  const totalDuration = samples.reduce((sum, s, i) => sum + durationWeight(samples, i), 0);
  const powerCoverage = samples.length ? powerValues.length / samples.length : 0;
  const hrCoverage = samples.length ? hrValues.length / samples.length : 0;
  const pairedCoverage = samples.length ? paired.length / samples.length : 0;
  if (powerCoverage < 0.8) flags.push("LOW_POWER_COVERAGE");
  if (hrCoverage < 0.8) flags.push("LOW_HR_COVERAGE");
  if (pairedCoverage < 0.7) flags.push("LOW_PAIRED_COVERAGE");

  const zones: Record<string, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0, z7: 0 };
  const bounds = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5].map(x => x * validFtp);
  samples.forEach((s, i) => {
    if (s.powerW === null) return;
    const w = s.powerW;
    const z = w < bounds[0] ? "z1" : w < bounds[1] ? "z2" : w < bounds[2] ? "z3" : w < bounds[3] ? "z4" : w < bounds[4] ? "z5" : w < bounds[5] ? "z6" : "z7";
    zones[z] += durationWeight(samples, i);
  });

  // Long aerobic block: at least 30 minutes of elapsed time and 80% valid
  // paired samples. Gaps <=15 s are tolerated but missing seconds are not fabricated.
  const aerobic = samples.filter(s => s.powerW !== null && s.hrBpm !== null && s.powerW >= validFtp * 0.55 && s.powerW <= validFtp * 0.78);
  let bestBlock: NormalizedSample[] = [], block: NormalizedSample[] = [];
  for (const s of aerobic) {
    if (block.length && s.t - block[block.length - 1].t > 15) {
      if (block.length > bestBlock.length) bestBlock = block;
      block = [];
    }
    block.push(s);
  }
  if (block.length > bestBlock.length) bestBlock = block;
  let decoupling: number | null = null;
  if (bestBlock.length >= 2) {
    const elapsed = bestBlock[bestBlock.length - 1].t - bestBlock[0].t;
    const coverage = bestBlock.length / Math.max(1, elapsed + 1);
    if (elapsed >= 1800 && coverage >= 0.8) {
      const midpoint = (bestBlock[0].t + bestBlock[bestBlock.length - 1].t) / 2;
      const first = bestBlock.filter(s => s.t <= midpoint && s.powerW! > 0);
      const second = bestBlock.filter(s => s.t > midpoint && s.powerW! > 0);
      const ef1p = mean(first.map(s => s.powerW!)), ef1h = mean(first.map(s => s.hrBpm!));
      const ef2p = mean(second.map(s => s.powerW!)), ef2h = mean(second.map(s => s.hrBpm!));
      if (ef1p && ef1h && ef2p && ef2h && first.length >= 600 && second.length >= 600) {
        decoupling = round(((ef1p / ef1h - ef2p / ef2h) / (ef1p / ef1h)) * 100);
      }
    }
  }
  if (decoupling === null) flags.push("AEROBIC_DECOUPLING_INSUFFICIENT_DATA");

  // Detect sustained work with 30 s rolling means on the normalized 1 Hz grid.
  const intervals: StreamMetrics["intervals"] = [];
  const rolling: Array<number | null> = [];
  for (let i = 0; i < samples.length; i++) {
    const window = samples.slice(Math.max(0, i - 29), i + 1);
    const valid = window.flatMap(s => s.powerW === null ? [] : [s.powerW]);
    rolling.push(window.length === 30 && valid.length >= 25 ? mean(valid) : null);
  }
  const candidates: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= rolling.length; i++) {
    const active = i < rolling.length && rolling[i] !== null && rolling[i]! >= validFtp * 0.84;
    if (active && start < 0) start = i;
    if (!active && start >= 0) {
      if (i - start >= 45) candidates.push([start, i - 1]);
      start = -1;
    }
  }
  const merged: Array<[number, number]> = [];
  for (const candidate of candidates) {
    const previous = merged[merged.length - 1];
    if (previous && candidate[0] - previous[1] <= 20) previous[1] = candidate[1];
    else merged.push([...candidate]);
  }
  for (const [s, e] of merged) {
    const effort = samples.slice(s, e + 1);
    const watts = effort.flatMap(x => x.powerW === null ? [] : [x.powerW]);
    const hrs = effort.flatMap(x => x.hrBpm === null ? [] : [x.hrBpm]);
    const avgPower = mean(watts);
    if (avgPower === null) continue;
    const post = samples.slice(e + 1, e + 21).flatMap(x => x.hrBpm === null ? [] : [x.hrBpm]);
    const peakHr = Math.max(maximum(hrs) ?? 0, maximum(post) ?? 0);
    const hrAt = (seconds: number) => samples.find(x => x.t >= samples[e].t + seconds)?.hrBpm ?? null;
    const hr30 = hrAt(30), hr60 = hrAt(60), hr120 = hrAt(120);
    const recoverySamples = samples.slice(e + 1, Math.min(samples.length, e + 121));
    const recoveryPower = mean(recoverySamples.flatMap(x => x.powerW === null ? [] : [x.powerW]));
    intervals.push({
      startSec: samples[s].t, endSec: samples[e].t, durationSec: samples[e].t - samples[s].t + 1,
      avgPowerW: Math.round(avgPower), avgCadence: mean(effort.flatMap(x => x.cadenceRpm === null ? [] : [x.cadenceRpm])),
      avgHr: mean(hrs) === null ? null : Math.round(mean(hrs)!), maxHr: maximum(hrs) === null ? null : Math.round(maximum(hrs)!),
      recoveryHrDropBpm: hr120 === null ? null : Math.round(peakHr - hr120),
      recoveryHrDrop30s: hr30 === null ? null : Math.round(peakHr - hr30),
      recoveryHrDrop60s: hr60 === null ? null : Math.round(peakHr - hr60),
      recoveryHrDrop120s: hr120 === null ? null : Math.round(peakHr - hr120),
      recoveryType: recoveryPower === null ? "unknown" : recoveryPower > 50 ? "active" : recoveryPower <= 20 ? "passive" : "unknown",
      intensity: classifyIntensity(avgPower, validFtp),
    });
  }

  const timeline30s: StreamMetrics["timeline30s"] = [];
  for (let i = 0; i < samples.length; i += 30) {
    const chunk = samples.slice(i, i + 30);
    timeline30s.push({
      t: chunk[0].t,
      powerW: mean(chunk.flatMap(s => s.powerW === null ? [] : [s.powerW])),
      hrBpm: mean(chunk.flatMap(s => s.hrBpm === null ? [] : [s.hrBpm])),
      cadenceRpm: mean(chunk.flatMap(s => s.cadenceRpm === null ? [] : [s.cadenceRpm])),
    });
  }
  const qualityScore = Math.max(0, Math.min(100, Math.round((powerCoverage * 0.4 + hrCoverage * 0.3 + pairedCoverage * 0.3) * 100 - flags.length * 5)));
  return {
    sampleCount: samples.length,
    durationSec: samples.length ? samples[samples.length - 1].t - samples[0].t + 1 : 0,
    coverage: { power: Math.round(powerCoverage * 100), heartRate: Math.round(hrCoverage * 100), paired: Math.round(pairedCoverage * 100) },
    dataQuality: { score: qualityScore, flags, timebase: rawTime.length ? "time_stream" : "index_fallback" },
    avgPowerW: mean(powerValues) === null ? null : Math.round(mean(powerValues)!),
    avgHr: mean(hrValues) === null ? null : Math.round(mean(hrValues)!),
    maxHr: maximum(hrValues) === null ? null : Math.round(maximum(hrValues)!),
    maxPowerW: maximum(powerValues),
    avgCadence: mean(samples.flatMap(s => s.cadenceRpm === null ? [] : [s.cadenceRpm])),
    avgSpeedMps: mean(samples.flatMap(s => s.speedMps === null ? [] : [s.speedMps])),
    maxSpeedMps: maximum(samples.flatMap(s => s.speedMps === null ? [] : [s.speedMps])),
    avgTempC: mean(samples.flatMap(s => s.tempC === null ? [] : [s.tempC])),
    avgGradePct: mean(samples.flatMap(s => s.gradePct === null ? [] : [s.gradePct])),
    powerHrEfficiency: mean(positivePairs.map(s => s.powerW!)) && mean(positivePairs.map(s => s.hrBpm!))
      ? round(mean(positivePairs.map(s => s.powerW!))! / mean(positivePairs.map(s => s.hrBpm!))!, 2) : null,
    aerobicDecouplingPct: decoupling,
    aerobicSamples: bestBlock.length,
    timeInPowerZonesSec: Object.fromEntries(Object.entries(zones).map(([key, value]) => [key, round(value, 0)])),
    timeline30s, intervals,
  };
}
