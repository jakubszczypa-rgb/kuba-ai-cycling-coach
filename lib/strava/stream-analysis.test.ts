import { describe, expect, it } from "vitest";
import { analyzeStravaStreams, normalizeStravaStreams, resampleToOneHz } from "@/lib/strava/stream-analysis";

function stream(duration: number, wattsAt: (t: number) => number, hrAt: (t: number) => number) {
  return {
    time: { data: Array.from({ length: duration }, (_, t) => t) },
    watts: { data: Array.from({ length: duration }, (_, t) => wattsAt(t)) },
    heartrate: { data: Array.from({ length: duration }, (_, t) => hrAt(t)) },
    cadence: { data: Array.from({ length: duration }, () => 85) },
    velocity_smooth: { data: Array.from({ length: duration }, () => 8) },
  };
}

describe("Strava stream normalization and physiology metrics", () => {
  it("does not pair streams with incompatible lengths", () => {
    const samples = normalizeStravaStreams({
      time: { data: [0, 1, 2, 3] },
      watts: { data: [180, 180, 180] },
      heartrate: { data: [130, 131, 132, 133] },
    });
    expect(samples).toHaveLength(4);
    expect(samples.every(s => s.powerW === null)).toBe(true);
    expect(samples[0].hrBpm).toBe(130);
  });

  it("resamples irregular timestamps to a 1 Hz grid without inventing missing power", () => {
    const normalized = normalizeStravaStreams({
      time: { data: [0, 1, 3, 4] },
      watts: { data: [200, 200, 200, 200] },
      heartrate: { data: [140, 141, 143, 144] },
    });
    const grid = resampleToOneHz(normalized);
    expect(grid.map(s => s.t)).toEqual([0, 1, 2, 3, 4]);
    expect(grid[2].powerW).toBeNull();
  });

  it("keeps real zero-watt coasting but excludes it from power/HR efficiency", () => {
    const metrics = analyzeStravaStreams({
      time: { data: [0, 1, 2, 3] },
      watts: { data: [200, 0, 200, 200] },
      heartrate: { data: [140, 140, 140, 140] },
    }, 238);
    expect(metrics.avgPowerW).toBe(150);
    expect(metrics.powerHrEfficiency).toBe(200 / 140);
  });

  it("calculates aerobic decoupling only on a long, sufficiently covered aerobic block", () => {
    const metrics = analyzeStravaStreams(stream(2400, () => 160, t => 130 + (15 * t) / 2399), 238);
    expect(metrics.aerobicDecouplingPct).not.toBeNull();
    expect(metrics.aerobicDecouplingPct!).toBeGreaterThan(0);
  });

  it("does not calculate aerobic decoupling from a short effort", () => {
    const metrics = analyzeStravaStreams(stream(900, () => 160, t => 130 + (8 * t) / 899), 238);
    expect(metrics.aerobicDecouplingPct).toBeNull();
    expect(metrics.dataQuality.flags).toContain("AEROBIC_DECOUPLING_INSUFFICIENT_DATA");
  });

  it("classifies sustained threshold and VO2 efforts and reports post-effort HR recovery", () => {
    const metrics = analyzeStravaStreams(stream(900, t => {
      const phase = t % 240;
      return phase < 180 ? 270 : 100;
    }, t => {
      const phase = t % 240;
      return phase < 180 ? 150 + phase * 0.1 : 168 - Math.min(18, (phase - 180) * 0.15);
    }), 238);
    expect(metrics.intervals.length).toBeGreaterThan(0);
    expect(["threshold", "vo2max", "anaerobic"]).toContain(metrics.intervals[0].intensity);
    expect(metrics.intervals[0].recoveryHrDrop60s).not.toBeNull();
  });

  it("weights power-zone time in seconds rather than counting samples", () => {
    const metrics = analyzeStravaStreams({
      time: { data: [0, 2, 4] },
      watts: { data: [100, 100, 100] },
      heartrate: { data: [120, 121, 122] },
    }, 238);
    expect(metrics.timeInPowerZonesSec.z1).toBe(5);
  });
});
