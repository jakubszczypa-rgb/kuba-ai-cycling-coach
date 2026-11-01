import type { PlannedWorkout } from "./plan-builder";

type AdjustmentInput = {
  plan: PlannedWorkout[];
  date: string;
  feeling: "great"|"good"|"average"|"tired"|"wrecked";
  availableMinutes: number;
  nightShift: boolean;
};

export function adjustPlan({ plan, date, feeling, availableMinutes, nightShift }: AdjustmentInput): PlannedWorkout[] {
  const next = plan.map(p => ({ ...p }));
  const idx = next.findIndex(p => p.date === date);
  if (idx < 0) return next;

  const current = next[idx];
  const forceRest = nightShift || feeling === "wrecked" || availableMinutes <= 0;

  if (forceRest) {
    next[idx] = { ...current, title: "Rest / regeneracja", type: "REST", durationMinutes: 0, priority: "RECOVERY", status: "MOVED" };
    const moved = next.findIndex((p, i) => i > idx && p.status === "PLANNED" && p.type !== "REST");
    if (moved >= 0) next[moved] = { ...next[moved], date, status: "MOVED" };
    return next;
  }

  if (feeling === "tired") {
    next[idx] = { ...current, title: "Easy Endurance", type: "ENDURANCE", durationMinutes: Math.min(availableMinutes, 60), priority: "RECOVERY", status: "MOVED" };
    return next;
  }

  next[idx] = { ...current, durationMinutes: Math.min(current.durationMinutes, availableMinutes), status: "PLANNED" };
  return next;
}
