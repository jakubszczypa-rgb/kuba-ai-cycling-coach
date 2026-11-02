import { describe, expect, it } from "vitest";
import { adjustPlan } from "./plan-adjuster";
import type { PlannedWorkout } from "./plan-builder";

const samplePlan: PlannedWorkout[] = [
  { id: "a", date: "2026-11-02", title: "Sweet Spot", type: "SWEET_SPOT", durationMinutes: 75, priority: "KEY", status: "PLANNED" },
  { id: "b", date: "2026-11-03", title: "Rest", type: "REST", durationMinutes: 0, priority: "RECOVERY", status: "PLANNED" },
  { id: "c", date: "2026-11-04", title: "Endurance", type: "ENDURANCE", durationMinutes: 90, priority: "SUPPORT", status: "PLANNED" },
];

describe("adjustPlan", () => {
  it("cancels the workout during illness instead of moving intensity to another day", () => {
    const result = adjustPlan({ plan: samplePlan, date: "2026-11-02", feeling: "good", availableMinutes: 90, nightShift: false, illness: true });
    expect(result[0].type).toBe("REST");
    expect(result[0].status).toBe("SKIPPED");
    expect(result[1].type).toBe("REST");
  });

  it("moves a missed session after a night shift to the next planned rest day", () => {
    const result = adjustPlan({ plan: samplePlan, date: "2026-11-02", feeling: "good", availableMinutes: 0, nightShift: true });
    expect(result[0].type).toBe("REST");
    expect(result[1].type).toBe("SWEET_SPOT");
    expect(result[1].date).toBe("2026-11-03");
  });

  it("reduces a planned session when the athlete is tired", () => {
    const result = adjustPlan({ plan: samplePlan, date: "2026-11-02", feeling: "tired", availableMinutes: 30, nightShift: false });
    expect(result[0].type).toBe("ENDURANCE");
    expect(result[0].durationMinutes).toBe(30);
  });
});
