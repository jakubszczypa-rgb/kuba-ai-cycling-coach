import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGarminClient, getDateDaysAgo } from "@/lib/garmin/client";
import { createServiceClient } from "@/lib/supabase/service";

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

async function syncGarmin(profileId: string, supabase: ReturnType<typeof createServiceClient>) {
  const garmin = getGarminClient();
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = getDateDaysAgo(28);

  const activities = await garmin.searchActivities({ startDate, endDate, limit: 100, start: 0 });
  let activityCount = 0;

  for (const activity of activities ?? []) {
    const a = activity as Record<string, unknown>;
    const activityId = text(a.activityId ?? a.activityID);
    const activityStart = dateTime(a.startTimeLocal ?? a.startTimeGMT ?? a.activityStartTime);
    if (!activityId || !activityStart) continue;

    const activityType = a.activityType as Record<string, unknown> | null;

    const row = {
      athlete_id: profileId,
      garmin_activity_id: activityId,
      activity_start: activityStart,
      sport: text(activityType?.typeKey ?? activityType?.typeName ?? a.sportTypeName ?? a.activityType),
      indoor: bool(a.indoor),
      duration_sec: num(a.duration),
      distance_m: num(a.distance),
      elevation_gain_m: num(a.elevationGain),
      avg_power_w: num(a.averagePower),
      normalized_power_w: num(a.normPower ?? a.normalizedPower),
      max_power_w: num(a.maxPower),
      intensity_factor: num(a.intensityFactor),
      tss: num(a.trainingStressScore ?? a.tss),
      avg_hr: num(a.averageHR),
      max_hr: num(a.maxHR),
      avg_cadence: num(a.averageBikingCadence ?? a.averageCadence),
      calories: num(a.calories),
      training_load: num(a.activityTrainingLoad ?? a.trainingLoad),
      raw_data: a,
    };

    const { error } = await supabase.from("garmin_activities")
      .upsert(row, { onConflict: "garmin_activity_id" });
    if (error) throw new Error(`Activity ${activityId}: ${error.message}`);
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
    const score = num(h.sleepScore ?? (h.sleepScoreOverall as Record<string, unknown> | null)?.value);
    const restingHr = num(h.restingHeartRate ?? h.restingHr);
    const hrv = num(h.avgHrv ?? h.averageHrv);
    const hrvStatus = text(h.hrvStatus);
    const stress = num(h.averageStressLevel ?? h.avgStress);
    const bodyBattery = num(h.bodyBattery ?? h.bodyBatteryValue);

    const { error } = await supabase.from("health_daily").upsert({
      athlete_id: profileId,
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

    if (error) throw new Error(`Health ${date}: ${error.message}`);
    healthCount++;
  }

  return { startDate, endDate, activities: activityCount, health: healthCount };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { data: profile, error } = await supabase.from("athlete_profile")
      .select("id").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

    const result = await syncGarmin(profile.id, supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GARMIN_SYNC_FAILED" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED_CRON" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data: profiles, error } = await supabase.from("athlete_profile").select("id").limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profiles?.[0]) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

    const result = await syncGarmin(profiles[0].id, supabase);
    return NextResponse.json({ ok: true, automatic: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GARMIN_CRON_SYNC_FAILED" }, { status: 500 });
  }
}
