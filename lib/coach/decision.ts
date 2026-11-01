export type CoachInput = {
  feeling: "great" | "good" | "average" | "tired" | "wrecked";
  availableMinutes: number;
  nightShift: boolean;
  illness?: boolean;
  load7d?: number;
  load28d?: number;
  hardSessions7d?: number;
  sleepMinutes?: number | null;
  sleepScore?: number | null;
  restingHr?: number | null;
  hrvStatus?: string | null;
};

export type CoachDecision = {
  decision: "TRAIN" | "EASY" | "REST";
  intensity: "LOW" | "MODERATE" | "HIGH";
  workoutType: string;
  durationMinutes: number;
  confidence: number;
  reasoning: string;
};

export function decideToday(input: CoachInput): CoachDecision {
  if (input.illness || input.nightShift || input.feeling === "wrecked" || input.availableMinutes <= 0) {
    return { decision:"REST", intensity:"LOW", workoutType:"REST", durationMinutes:0, confidence:0.98,
      reasoning:"Regeneracja ma dziś pierwszeństwo. Nie dokładamy bodźca po chorobie, nocnej zmianie lub bardzo słabym samopoczuciu." };
  }

  const sleepPoor = input.sleepMinutes !== null && input.sleepMinutes !== undefined && input.sleepMinutes < 360;
  const sleepVeryPoor = input.sleepMinutes !== null && input.sleepMinutes !== undefined && input.sleepMinutes < 300;
  const recoveryWarning = input.hrvStatus === "LOW" || input.hrvStatus === "UNBALANCED";
  const loadRatio = input.load28d && input.load28d > 0 ? (input.load7d ?? 0) / input.load28d : 0;
  const hardSessions = input.hardSessions7d ?? 0;

  if (sleepVeryPoor || (recoveryWarning && input.feeling === "tired")) {
    return { decision:"REST", intensity:"LOW", workoutType:"REST", durationMinutes:0, confidence:0.93,
      reasoning:"Dane regeneracyjne wskazują na zbyt słabą gotowość do jakościowego treningu. Dziś odpoczynek jest lepszą inwestycją niż dokładanie obciążenia." };
  }

  if (sleepPoor || input.feeling === "tired" || hardSessions >= 3 || loadRatio > 0.45) {
    return { decision:"EASY", intensity:"LOW", workoutType:"ENDURANCE", durationMinutes:Math.min(input.availableMinutes,60), confidence:0.92,
      reasoning:"Dziś ograniczamy bodziec. Zestawienie samopoczucia, regeneracji i ostatniego obciążenia nie uzasadnia intensywności. Jeśli jedziesz, tylko spokojny endurance." };
  }

  if (input.feeling === "average") {
    return { decision:"TRAIN", intensity:"MODERATE", workoutType:"ENDURANCE", durationMinutes:Math.min(input.availableMinutes,90), confidence:0.87,
      reasoning:"Możemy trenować, ale bez agresywnej intensywności. Priorytetem jest spokojna praca tlenowa i budowanie wytrzymałości." };
  }

  if (input.feeling === "great" && input.availableMinutes >= 60 && hardSessions < 2) {
    return { decision:"TRAIN", intensity:"HIGH", workoutType:"SWEET_SPOT", durationMinutes:Math.min(input.availableMinutes,90), confidence:0.86,
      reasoning:"Dobre samopoczucie i wystarczający czas pozwalają na jakościowy bodziec. Liczba mocnych sesji i regeneracja nie wskazują obecnie na konieczność odpuszczenia." };
  }

  return { decision:"TRAIN", intensity:"MODERATE", workoutType:"ENDURANCE", durationMinutes:input.availableMinutes, confidence:0.86,
    reasoning:"Samopoczucie pozwala na trening. Bazą pozostaje endurance, a intensywność będziemy zwiększać tylko przy odpowiedniej regeneracji." };
}
