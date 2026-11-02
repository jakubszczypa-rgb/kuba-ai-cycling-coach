import type { PlannedWorkout } from "./plan-builder";

type AdjustmentInput = {
  plan: PlannedWorkout[];
  date: string;
  feeling: "great" | "good" | "average" | "tired" | "wrecked";
  availableMinutes: number;
  nightShift: boolean;
  illness?: boolean;
};

function sortPlan(plan: PlannedWorkout[]) {
  return [...plan].sort((a, b) => a.date.localeCompare(b.date));
}

export function adjustPlan({ plan, date, feeling, availableMinutes, nightShift, illness = false }: AdjustmentInput): PlannedWorkout[] {
  const next = sortPlan(plan).map(p => ({ ...p }));
  const idx = next.findIndex(p => p.date === date);
  if (idx < 0) return next;

  const current = next[idx];
  const forceRest = nightShift || illness || feeling === "wrecked" || availableMinutes <= 0;

  if (forceRest) {
    if (current.type === "REST") return next;

    // Move today's workout to the next planned rest day.
    const destinationIdx = next.findIndex(
      (p, i) => i > idx && p.type === "REST" && p.status === "PLANNED"
    );

    next[idx] = {
      ...current,
      title: "Rest / regeneracja",
      type: "REST",
      durationMinutes: 0,
      priority: "RECOVERY",
      status: "MOVED",
    };

    if (destinationIdx >= 0) {
      const destination = next[destinationIdx];
      next[destinationIdx] = {
        ...current,
        date: destination.date,
        status: "MOVED",
      };
    }

    return next;
  }

  if (feeling === "tired") {
    next[idx] = {
      ...current,
      title: "Easy Endurance",
      type: "ENDURANCE",
      durationMinutes: Math.min(availableMinutes, 60),
      priority: "RECOVERY",
      status: "MOVED",
    };
    return next;
  }

  next[idx] = {
    ...current,
    durationMinutes: Math.min(current.durationMinutes, availableMinutes),
    status: "PLANNED",
  };
  return next;
}
