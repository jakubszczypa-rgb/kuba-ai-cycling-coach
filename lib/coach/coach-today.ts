import { decideToday, type CoachInput, type CoachDecision } from "./decision";
import { generateWorkout, type Workout } from "./workout-generator";

export type DailyCoachResult = CoachDecision & {
  workout: Workout | null;
};

export function coachToday(input: CoachInput & { ftpW: number }): DailyCoachResult {
  const decision = decideToday(input);
  const workout =
    decision.decision === "REST"
      ? null
      : generateWorkout(decision.workoutType, decision.durationMinutes, input.ftpW);

  return { ...decision, workout };
}
