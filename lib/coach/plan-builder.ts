export type PlannedWorkout = {
  id: string;
  date: string;
  title: string;
  type: "ENDURANCE" | "SWEET_SPOT" | "RECOVERY" | "REST";
  durationMinutes: number;
  priority: "KEY" | "SUPPORT" | "RECOVERY";
  status: "PLANNED" | "DONE" | "SKIPPED" | "MOVED";
};

export type AvailabilityDay = {
  date: string;
  availableMinutes: number;
  nightShift?: boolean;
};

export function buildPlan(startDate: string, days: AvailabilityDay[], ftpW: number): PlannedWorkout[] {
  let keyCount = 0;
  return days.map((day, index) => {
    const d = new Date(day.date + "T12:00:00");
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (day.availableMinutes <= 0 || day.nightShift) return {
      id: "plan-" + index, date: day.date, title: "Rest", type: "REST",
      durationMinutes: 0, priority: "RECOVERY", status: "PLANNED"
    };
    if (keyCount < 2 && day.availableMinutes >= 60 && !weekend) {
      keyCount++;
      return {
        id: "plan-" + index, date: day.date, title: "Sweet Spot",
        type: "SWEET_SPOT", durationMinutes: Math.min(day.availableMinutes, 75),
        priority: "KEY", status: "PLANNED"
      };
    }
    return {
      id: "plan-" + index, date: day.date, title: weekend ? "Long Endurance" : "Endurance",
      type: "ENDURANCE", durationMinutes: Math.min(day.availableMinutes, weekend ? 150 : 90),
      priority: "SUPPORT", status: "PLANNED"
    };
  });
}
