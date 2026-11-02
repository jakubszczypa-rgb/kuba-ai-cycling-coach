import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeTraining } from "@/lib/coach/analytics";
import { buildAthleteBrief } from "@/lib/coach/athlete-brief";
import { coachToday } from "@/lib/coach/coach-today";
import type { CoachInput } from "@/lib/coach/decision";

function todayInPoland() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const date = todayInPoland();
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile, error: profileError } = await supabase
    .from("athlete_profile")
    .select("id,name,age,height_cm,weight_kg,current_ftp_w,vo2max,primary_goal")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  }

  const [statusResult, garminActivityResult, stravaActivityResult, healthResult, planResult, garminStreamResult, stravaStreamResult] = await Promise.all([
    supabase.from("daily_status")
      .select("feeling,available_minutes,night_shift,illness,work_shift,notes")
      .eq("athlete_id", profile.id).eq("date", date).maybeSingle(),
    supabase.from("garmin_activities")
      .select("activity_start,duration_sec,avg_power_w,normalized_power_w,avg_hr,tss,sport")
      .eq("athlete_id", profile.id).gte("activity_start", since).order("activity_start"),
    supabase.from("strava_activities")
      .select("activity_start,duration_sec,avg_power_w,weighted_power_w,avg_hr,suffer_score,sport")
      .eq("athlete_id", profile.id).gte("activity_start", since).order("activity_start"),
    supabase.from("health_daily")
      .select("date,sleep_minutes,sleep_score,resting_hr,hrv_ms,hrv_status,stress_avg,body_battery")
      .eq("athlete_id", profile.id).order("date", { ascending: false }).limit(7),
    supabase.from("plan_days")
      .select("plan_date,title,workout_type,duration_minutes,priority,status")
      .eq("athlete_id", profile.id).gte("plan_date", date).order("plan_date").limit(7),
    supabase.from("garmin_activity_streams").select("metrics,sample_count,activity_start")
      .eq("athlete_id", profile.id).gte("activity_start", since)
      .order("activity_start", { ascending: false }).limit(30),
    supabase.from("strava_activity_streams").select("metrics,sample_count,activity_start")
      .eq("athlete_id", profile.id).gte("activity_start", since)
      .order("activity_start", { ascending: false }).limit(30),
  ]);

  const fatalError = statusResult.error ?? healthResult.error ?? planResult.error
    ?? (garminActivityResult.error && stravaActivityResult.error ? garminActivityResult.error : null)
    ?? (garminStreamResult.error && stravaStreamResult.error ? garminStreamResult.error : null);
  if (fatalError) return NextResponse.json({ error: fatalError.message }, { status: 500 });

  const status = statusResult.data;
  const garminActivities = garminActivityResult.data ?? [];
  const fallbackStravaActivities = (stravaActivityResult.data ?? []).filter(s =>
    !garminActivities.some(g => Math.abs(new Date(g.activity_start).getTime() - new Date(s.activity_start).getTime()) < 10 * 60 * 1000)
  );
  const mergedActivities = [...garminActivities.map(a => ({
    date: a.activity_start, durationMinutes: (a.duration_sec ?? 0) / 60, avgPowerW: a.avg_power_w,
    normalizedPowerW: a.normalized_power_w, avgHr: a.avg_hr, tss: a.tss,
  })), ...fallbackStravaActivities.map(a => ({
    date: a.activity_start, durationMinutes: (a.duration_sec ?? 0) / 60, avgPowerW: a.avg_power_w,
    normalizedPowerW: a.weighted_power_w, avgHr: a.avg_hr, tss: a.suffer_score,
  }))];
  const activities = mergedActivities.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const ftpW = Number(profile.current_ftp_w) > 0 ? Number(profile.current_ftp_w) : 238;
  const analytics = analyzeTraining(activities, ftpW);
  const feeling = (status?.feeling ?? "good") as CoachInput["feeling"];
  const availableMinutes = status?.available_minutes ?? 60;
  const nightShift = status?.night_shift ?? false;
  const illness = status?.illness ?? false;
  const input: CoachInput = {
    feeling,
    availableMinutes,
    nightShift,
    illness,
    load7d: analytics.load7d,
    load28d: analytics.load28d,
    hardSessions7d: analytics.hardSessions7d,
    sleepMinutes: healthResult.data?.[0]?.sleep_minutes,
    sleepScore: healthResult.data?.[0]?.sleep_score,
    restingHr: healthResult.data?.[0]?.resting_hr,
    hrvStatus: healthResult.data?.[0]?.hrv_status,
  };

  const result = coachToday({ ...input, ftpW });
  const garminStreams = garminStreamResult.data ?? [];
  const fallbackStravaStreams = (stravaStreamResult.data ?? []).filter(s =>
    !garminStreams.some(g => Math.abs(new Date(g.activity_start).getTime() - new Date(s.activity_start).getTime()) < 10 * 60 * 1000)
  );
  const streamRows = [...garminStreams, ...fallbackStravaStreams];
  const streamMetrics = streamRows.map(row => row.metrics as Record<string, any>);
  const validDecoupling = streamMetrics.map(m => m.aerobicDecouplingPct).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const intervals = streamMetrics.flatMap(m => Array.isArray(m.intervals) ? m.intervals : []);
  const recoveryDrops = intervals.map((x: any) => x.recoveryHrDropBpm).filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
  const streamAnalysis = {
    analyzedActivities: streamMetrics.length,
    primarySource: "Garmin FIT",
    sampleCount: streamRows.reduce((sum, row) => sum + Number(row.sample_count ?? 0), 0),
    averageAerobicDecouplingPct: validDecoupling.length ? Math.round(validDecoupling.reduce((a,b)=>a+b,0) / validDecoupling.length * 10) / 10 : null,
    aerobicDecouplingSessions: validDecoupling.length,
    detectedIntervals: intervals.length,
    averageIntervalRecoveryHrDropBpm: recoveryDrops.length ? Math.round(recoveryDrops.reduce((a,b)=>a+b,0) / recoveryDrops.length) : null,
    note: "Wyniki wyliczone głównie z sekundowych strumieni Garmin FIT; Strava uzupełnia wyłącznie brakujące aktywności. Decoupling liczony wyłącznie z dostatecznie długich fragmentów 55-78% FTP; brak wyniku oznacza brak wystarczających danych.",
  };
  const brief = {
    ...buildAthleteBrief({
      goal: profile.primary_goal,
      ftpW,
      vo2max: profile.vo2max,
      feeling,
      availableMinutes,
      nightShift,
      analytics,
    }),
    streamAnalysis,
  };

  await supabase.from("coach_decisions").insert({
    athlete_id: profile.id,
    decision_date: date,
    decision: result.decision,
    intensity: result.intensity,
    duration_minutes: result.durationMinutes,
    workout_type: result.workoutType,
    confidence: result.confidence,
    reasoning: result.reasoning,
    input_snapshot: brief,
  });

  return NextResponse.json({
    date,
    athlete: {
      name: profile.name,
      ftpW,
      vo2max: profile.vo2max,
      goal: profile.primary_goal,
    },
    today: {
      feeling,
      availableMinutes,
      nightShift,
      illness,
      health: healthResult.data?.[0] ?? null,
    },
    analytics,
    streamAnalysis,
    decision: result,
    plan: planResult.data ?? [],
  });
}
