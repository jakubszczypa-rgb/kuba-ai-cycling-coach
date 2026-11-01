import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDateDaysAgo, getGarminClient } from "@/lib/garmin/client";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function dateTime(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("athlete_profile")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    const garmin = getGarminClient();
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = getDateDaysAgo(28);

    const activities = await garmin.searchActivities({
      startDate,
      endDate,
      limit: 100,
      start: 0,
    });

    let activityCount = 0;

    for (const activity of activities ?? []) {
      const a = activity as Record<string, unknown>;
      const activityId = text(a.activityId ?? a.activityID);
      if (!activityId) continue;

      const activityStart = dateTime(a.startTimeLocal ?? a.startTimeGMT ?? a.activityStartTime);
      if (!activityStart) continue;

      const row = {
        athlete_id: profile.id,
        garmin_activity_id: activityId,
        activity_start: activityStart,
        sport: text(a.activityType?.typeKey ?? a.activityType?.typeName ?? a.activityType),
        indoor: bool(a.indoor),
        duration_sec: num(a.duration),
        distance_m: num(a.distance),
        elevation_gain_m: num(a.elevationGain),
        avg_power_w: num(a.averagePower),
        normalized_power_w: num(a.normPower ?? a.normalizedPower),
        max_power_w: num(a.maxPower),
        intensity_factor: num(a.trainingEffectLabel ? null : a.intensityFactor),
        tss: num(a.trainingStressScore ?? a.tss),
        avg_hr: num(a.averageHR),
        max_hr: num(a.maxHR),
        avg_cadence: num(a.averageBikingCadence ?? a.averageCadence),
        calories: num(a.calories),
        training_load: num(a.activityTrainingLoad ?? a.trainingLoad),
        raw_data: a,
      };

      const { error } = await supabase
        .from("garmin_activities")
        .upsert(row, { onConflict: "garmin_activity_id" });

      if (error) {
        return NextResponse.json({ error: error.message, activityId }, { status: 500 });
      }

      activityCount++;
    }

    const sleepSummaries = await garmin.getDailySleepSummaries(startDate, endDate);
    const healthRows = Array.isArray(sleepSummaries)
      ? sleepSummaries
      : ((sleepSummaries as Record<string, unknown> | null)?.sleepSummaries as unknown[] | undefined) ?? [];

    let healthCount = 0;

    for (const item of healthRows) {
      const h = item as Record<string, unknown>;
      const date = text(h.calendarDate ?? h.date);
      if (!date) continue;

      const sleepSeconds = num(h.sleepTimeSeconds ?? h.totalSleepSeconds);
      const score = num(h.sleepScore ?? h.sleepScoreOverall?.value);
      const restingHr = num(h.restingHeartRate ?? h.restingHr);
      const hrv = num(h.avgHrv ?? h.averageHrv);
      const hrvStatus = text(h.hrvStatus);
      const stress = num(h.averageStressLevel ?? h.avgStress);
      const bodyBattery = num(h.bodyBattery ?? h.bodyBatteryValue);

      const { error } = await supabase
        .from("health_daily")
        .upsert({
          athlete_id: profile.id,
          date,
          sleep_minutes: sleepSeconds !== null ? Math.round(sleepSeconds / 60) : null,
          sleep_score: score,
          resting_hr: restingHr !== null ? Math.round(restingHr) : null,
          hrv_ms: hrv,
          hrv_status: hrvStatus,
          stress_avg: stress,
          body_battery: bodyBattery,
          raw_data: h,
        }, { onConflict: "athlete_id,date" });

      if (error) {
        return NextResponse.json({ error: error.message, date }, { status: 500 });
      }

      healthCount++;
    }

    return NextResponse.json({
      ok: true,
      range: { startDate, endDate },
      activities: activityCount,
      health: healthCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GARMIN_SYNC_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
