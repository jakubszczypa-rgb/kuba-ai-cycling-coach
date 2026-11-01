import type { TrainingAnalytics } from "./analytics";

export type AthleteBrief = {
  goal: string | null;
  ftpW: number | null;
  vo2max: number | null;
  feeling: string | null;
  availableMinutes: number | null;
  nightShift: boolean;
  analytics: TrainingAnalytics;
};

export function buildAthleteBrief(input: AthleteBrief) {
  return {
    goal: input.goal,
    fitness: { ftpW: input.ftpW, vo2max: input.vo2max },
    today: {
      feeling: input.feeling,
      availableMinutes: input.availableMinutes,
      nightShift: input.nightShift,
    },
    training: input.analytics,
    instruction:
      "Podejmij decyzję jak trener: uwzględnij regenerację, obciążenie, dostępny czas i cel. Nie realizuj planu za wszelką cenę.",
  };
}
