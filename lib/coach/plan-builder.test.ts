import { describe, expect, it } from "vitest";
import { buildPlan } from "./plan-builder";

function days(start: string, count: number, availableMinutes = 90) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + "T12:00:00");
    date.setDate(date.getDate() + index);
    return { date: date.toISOString().slice(0, 10), availableMinutes, nightShift: false };
  });
}

describe("buildPlan", () => {
  it("never schedules key workouts on consecutive days", () => {
    const plan = buildPlan("2026-11-02", days("2026-11-02", 14), 238);
    const keyDates = plan.filter(x => x.priority === "KEY").map(x => new Date(x.date + "T12:00:00").getTime());
    for (let i = 1; i < keyDates.length; i++) {
      expect((keyDates[i] - keyDates[i - 1]) / 86400000).toBeGreaterThanOrEqual(2);
    }
  });

  it("schedules no more than two key sessions in any rolling seven-day window", () => {
    const plan = buildPlan("2026-11-02", days("2026-11-02", 21), 238);
    const keys = plan.filter(x => x.priority === "KEY");
    for (const item of keys) {
      const start = new Date(item.date + "T12:00:00").getTime();
      const count = keys.filter(x => {
        const time = new Date(x.date + "T12:00:00").getTime();
        return time >= start && time < start + 7 * 86400000;
      }).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("forces rest on night shifts and zero-availability days", () => {
    const input = days("2026-11-02", 3);
    input[0].nightShift = true;
    input[1].availableMinutes = 0;
    const plan = buildPlan(input[0].date, input, 238);
    expect(plan[0].type).toBe("REST");
    expect(plan[1].type).toBe("REST");
  });

  it("keeps the day after a key workout easy when time is available", () => {
    const plan = buildPlan("2026-11-02", days("2026-11-02", 7), 238);
    const keyIndex = plan.findIndex(x => x.priority === "KEY");
    expect(keyIndex).toBeGreaterThanOrEqual(0);
    if (keyIndex + 1 < plan.length && plan[keyIndex + 1].type !== "REST") {
      expect(plan[keyIndex + 1].type).toBe("RECOVERY");
    }
  });
});
