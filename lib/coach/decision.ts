export type CoachInput = {
  feeling: "great"|"good"|"average"|"tired"|"wrecked";
  availableMinutes: number;
  nightShift: boolean;
  illness?: boolean;
  load7d?: number;
  load28d?: number;
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
  if (input.illness || input.nightShift || input.feeling === "wrecked" || input.availableMinutes <= 0)
    return {decision:"REST",intensity:"LOW",workoutType:"REST",durationMinutes:0,confidence:0.98,reasoning:"Regeneracja ma dziś pierwszeństwo. Nie dokładamy bodźca po chorobie, nocnej zmianie lub bardzo słabym samopoczuciu."};

  const loadRatio = input.load28d && input.load28d > 0 ? (input.load7d ?? 0) / input.load28d : 0;
  if (input.feeling === "tired")
    return {decision:"EASY",intensity:"LOW",workoutType:"ENDURANCE",durationMinutes:Math.min(input.availableMinutes,60),confidence:0.94,reasoning:"Zmęczenie jest sygnałem do ograniczenia bodźca. Dziś spokojna jazda zamiast intensywności."};

  if (loadRatio > 0.45)
    return {decision:"EASY",intensity:"LOW",workoutType:"RECOVERY",durationMinutes:Math.min(input.availableMinutes,60),confidence:0.86,reasoning:"Ostatnie 7 dni stanowią dużą część obciążenia z 28 dni. Lepiej odpuścić intensywność i pozwolić organizmowi się zaadaptować."};

  if (input.feeling === "average")
    return {decision:"TRAIN",intensity:"MODERATE",workoutType:"ENDURANCE",durationMinutes:Math.min(input.availableMinutes,90),confidence:0.84,reasoning:"Możemy trenować, ale bez agresywnej intensywności. Priorytetem jest spokojna praca tlenowa."};

  if (input.feeling === "great" && input.availableMinutes >= 60)
    return {decision:"TRAIN",intensity:"HIGH",workoutType:"SWEET_SPOT",durationMinutes:Math.min(input.availableMinutes,90),confidence:0.83,reasoning:"Dobre samopoczucie i wystarczający czas pozwalają na jakościowy bodziec. Intensywność nadal jest ograniczona przez bieżące obciążenie."};

  return {decision:"TRAIN",intensity:"MODERATE",workoutType:"ENDURANCE",durationMinutes:input.availableMinutes,confidence:0.86,reasoning:"Samopoczucie pozwala na trening. Bazą pozostaje endurance, a obciążenie będziemy korygować na podstawie kolejnych danych."};
}
