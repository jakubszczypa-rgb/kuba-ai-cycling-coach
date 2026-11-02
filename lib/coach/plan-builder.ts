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

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string) {
  return Math.floor(new Date(date + "T12:00:00").getTime() / DAY_MS);
}

/** Builds a conservative 2-week plan: no back-to-back key sessions and max two per rolling 7 days. */
export function buildPlan(_startDate: string, days: AvailabilityDay[], _ftpW: number): PlannedWorkout[] {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const keyDates: number[] = [];

  return ordered.map((day, index) => {
    const dateNumber = dayNumber(day.date);
    const recentKeys = keyDates.filter(keyDate => dateNumber - keyDate < 7);
    const weekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay());

    if (day.availableMinutes <= 0 || day.nightShift) {
      return { id: "plan-" + index, date: day.date, title: "Rest / regeneracja", type: "REST", durationMinutes: 0, priority: "RECOVERY", status: "PLANNED" };
    }

    // Quality only after at least 48 hours since the previous key session, max 2 in 7 days.
    const enoughRecovery = keyDates.length === 0 || dateNumber - keyDates[keyDates.length - 1] >= 2;
    const canScheduleKey = day.availableMinutes >= 60 && recentKeys.length < 2 && enoughRecovery && !weekend;

    if (canScheduleKey) {
      keyDates.push(dateNumber);
      return { id: "plan-" + index, date: day.date, title: "Sweet Spot 2×", type: "SWEET_SPOT", durationMinutes: Math.min(day.availableMinutes, 75), priority: "KEY", status: "PLANNED" };
    }

    // Keep one easy day after a quality session where the schedule permits it.
    const dayAfterKey = keyDates.length > 0 && dateNumber - keyDates[keyDates.length - 1] === 1;
    if (dayAfterKey) {
      return { id: "plan-" + index, date: day.date, title: "Recovery Spin", type: "RECOVERY", durationMinutes: Math.min(day.availableMinutes, 45), priority: "RECOVERY", status: "PLANNED" };
    }

    return { id: "plan-" + index, date: day.date, title: weekend ? "Long Endurance" : "Endurance", type: "ENDURANCE", durationMinutes: Math.min(day.availableMinutes, weekend ? 150 : 90), priority: "SUPPORT", status: "PLANNED" };
  });
}
