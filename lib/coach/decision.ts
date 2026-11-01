export type CoachInput = {
  feeling: "great"|"good"|"average"|"tired"|"wrecked";
  availableMinutes: number;
  nightShift: boolean;
  illness?: boolean;
};

export type CoachDecision = {
  decision: "TRAIN"|"EASY"|"REST";
  intensity: "LOW"|"MODERATE"|"HIGH";
  workoutType: string;
  durationMinutes: number;
  confidence: number;
  reasoning: string;
};

export function decideToday(input: CoachInput): CoachDecision {
  if (input.illness || input.nightShift || input.feeling === "wrecked" || input.availableMinutes === 0)
    return {decision:"REST",intensity:"LOW",workoutType:"REST",durationMinutes:0,confidence:0.96,reasoning:"Regeneracja ma dziś pierwszeństwo przed realizacją planu."};
  if (input.feeling === "tired")
    return {decision:"EASY",intensity:"LOW",workoutType:"ENDURANCE",durationMinutes:Math.min(input.availableMinutes,60),confidence:0.90,reasoning:"Przy zmęczeniu lepiej utrzymać ruch bez dokładania dużego bodźca."};
  if (input.feeling === "average")
    return {decision:"TRAIN",intensity:"MODERATE",workoutType:"ENDURANCE",durationMinutes:Math.min(input.availableMinutes,90),confidence:0.78,reasoning:"Możemy trenować, ale bez agresywnej intensywności."};
  return {decision:"TRAIN",intensity:"MODERATE",workoutType:"ENDURANCE",durationMinutes:input.availableMinutes,confidence:0.84,reasoning:"Samopoczucie pozwala na trening; dokładną intensywność później skorygują dane Garmin."};
}
