import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_NOT_CONFIGURED" }, { status: 503 });

  const { data: profile } = await supabase.from("athlete_profile")
    .select("id,name,current_ftp_w,primary_goal").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: rows, error } = await supabase.from("strava_activity_streams")
    .select("activity_start,duration_sec,metrics,sample_count")
    .eq("athlete_id", profile.id).gte("activity_start", since)
    .order("activity_start", { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: "NO_STREAM_DATA" }, { status: 409 });

  const ftpW = Number(profile.current_ftp_w) > 0 ? Number(profile.current_ftp_w) : 238;
  // Send only decision-relevant aggregates to the model. Raw 30-second timelines
  // remain stored in Supabase and are not duplicated into a huge prompt.
  const sessions = rows.map(row => {
    const m = (row.metrics ?? {}) as Record<string, any>;
    return {
      date: row.activity_start,
      durationMin: Math.round(Number(row.duration_sec ?? m.durationSec ?? 0) / 60),
      samples: Number(row.sample_count ?? m.sampleCount ?? 0),
      coverage: m.coverage ?? null,
      avgPowerW: m.avgPowerW ?? null,
      avgHr: m.avgHr ?? null,
      maxHr: m.maxHr ?? null,
      maxPowerW: m.maxPowerW ?? null,
      avgCadence: m.avgCadence ?? null,
      avgSpeedMps: m.avgSpeedMps ?? null,
      avgTempC: m.avgTempC ?? null,
      avgGradePct: m.avgGradePct ?? null,
      powerHrEfficiency: m.powerHrEfficiency ?? null,
      aerobicDecouplingPct: m.aerobicDecouplingPct ?? null,
      aerobicSamples: m.aerobicSamples ?? 0,
      timeInPowerZonesSec: m.timeInPowerZonesSec ?? null,
      intervals: Array.isArray(m.intervals) ? m.intervals.slice(0, 12) : [],
    };
  });

  const payload = {
    athlete: { name: profile.name, ftpW, goal: profile.primary_goal },
    period: "ostatnie 90 dni",
    sessionsAnalyzed: sessions.length,
    totalSamples: sessions.reduce((sum, s) => sum + s.samples, 0),
    sessions,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "Jesteś trenerem kolarstwa wytrzymałościowego i analitykiem danych. Odpowiadasz po polsku, konkretnie i krytycznie. Nie diagnozuj medycznie, nie wymyślaj danych. Oddziel fakty od hipotez. Zwróć czytelny raport z sekcjami: Najważniejsze wnioski; Dryf tętna i baza tlenowa; Reakcja HR na interwały i regeneracja; Relacja moc–HR w czasie; Rekomendacje treningowe; Ograniczenia danych. Porównuj podobne zakresy mocy. Jeżeli danych jest za mało, powiedz to wprost. Nie traktuj indoor i outdoor jako bezpośrednio porównywalnych bez zastrzeżeń."
        },
        {
          role: "user",
          content: "Przeanalizuj wszystkie sesje z ostatnich 90 dni. Poszukaj trendów pomiędzy treningami, a także reakcji tętna w interwałach i przerwach. Dryf oceniaj wyłącznie dla wiarygodnych, długich odcinków tlenowych. Podawaj konkretne liczby. Dane: " + JSON.stringify(payload)
        }
      ],
      max_completion_tokens: 5000,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({
      error: result?.error?.message ?? "OPENAI_ANALYSIS_FAILED",
      providerStatus: response.status,
    }, { status: 502 });
  }

  const choice = result?.choices?.[0];
  const rawContent = choice?.message?.content;
  const analysis = typeof rawContent === "string"
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((part: any) => typeof part?.text === "string" ? part.text : "").join("\n")
      : "";

  if (!analysis.trim()) {
    console.error("AI stream analysis returned no text", {
      model: result?.model,
      finishReason: choice?.finish_reason,
      refusal: choice?.message?.refusal ?? null,
      usage: result?.usage ?? null,
      choiceCount: Array.isArray(result?.choices) ? result.choices.length : 0,
    });
    return NextResponse.json({
      error: choice?.message?.refusal || "Model nie zwrócił tekstu analizy. Spróbuj ponownie.",
      code: "EMPTY_AI_ANALYSIS",
      finishReason: choice?.finish_reason ?? null,
    }, { status: 502 });
  }

  return NextResponse.json({
    analysis,
    sessionsAnalyzed: sessions.length,
    totalSamples: payload.totalSamples,
    ftpW,
    generatedAt: new Date().toISOString(),
  });
}
