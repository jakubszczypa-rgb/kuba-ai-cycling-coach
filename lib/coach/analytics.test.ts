import { describe, expect, it } from "vitest";
import { analyzeTraining } from "./analytics";

function recentDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

describe("analyzeTraining", () => {
  it("does not dilute average power with outdoor HR-only rides", () => {
    const result = analyzeTraining([
      { date: recentDate(1), durationMinutes: 60, avgPowerW: 180, avgHr: 145, tss: 55 },
      { date: recentDate(2), durationMinutes: 90, avgPowerW: null, avgHr: 130, tss: 60 },
    ]);
    expect(result.avgPower7d).toBe(180);
    expect(result.avgHr7d).toBe(138);
    expect(result.powerHrSessions7d).toBe(1);
  });

  it("does not calculate power/HR efficiency without paired power and heart rate", () => {
    const result = analyzeTraining([
      { date: recentDate(1), durationMinutes: 90, avgPowerW: null, avgHr: 135 },
      { date: recentDate(2), durationMinutes: 60, avgPowerW: 180, avgHr: null },
    ]);
    expect(result.powerHrEfficiency).toBeNull();
    expect(result.efficiencyTrend).toBe("INSUFFICIENT_DATA");
  });

  it("marks duration-based training load as estimated when TSS is absent", () => {
    const result = analyzeTraining([{ date: recentDate(1), durationMinutes: 60, avgHr: 130 }]);
    expect(result.load7d).toBe(50);
    expect(result.loadEstimated).toBe(true);
  });

  it("uses supplied TSS when available and marks the load as measured", () => {
    const result = analyzeTraining([{ date: recentDate(1), durationMinutes: 60, tss: 72 }]);
    expect(result.load7d).toBe(72);
    expect(result.loadEstimated).toBe(false);
  });
});
