import { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import FitParser from "fit-file-parser";
import { createClient } from "@/lib/supabase/server";
import { getGarminClient, getDateDaysAgo } from "@/lib/garmin/client";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzeStravaStreams, type StravaStreams } from "@/lib/strava/stream-analysis";

export const runtime = "nodejs";
export const maxDuration = 300;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function text(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function dateTime(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function isCyclingActivity(a: Record<string, unknown>) {
  const type = a.activityType as Record<string, unknown> | null;
  const label = String(type?.typeKey ?? type?.typeName ?? a.sportTypeName ?? a.activityType ?? "").toLowerCase();
  return /cycl|bik|ride|mtb|gravel/.test(label);
}

async function parseFitZip(zipBytes: Uint8Array): Promise<StravaStreams> {
  const files = unzipSync(zipBytes);
  const entry = Object.entries(files).find(([name, bytes]) => name.toLowerCase().endsWith(".fit") && bytes.length > 0);
  if (!entry) throw new Error("GARMIN_FIT_FILE_NOT_FOUND_IN_ARCHIVE");

  const parsed = await new FitParser({ force: false }).parseAsync(Buffer.from(entry[1]));
  const records = Array.isArray((parsed as Record<string, unknown>).records)
    ? (parsed as Record<string, unknown>).records as Array<Record<string, unknown>>
    : [];
  if (records.length < 2) throw new Error("GARMIN_FIT_HAS_NO_RECORD_SAMPLES");

  const timestamps = records.map(record => {
    const raw = record.timestamp;
    const date = raw instanceof Date ? raw : new Date(raw as string | number);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  });
  const firstTimestamp = timestamps.find((value): value is number => value !== null);
  if (firstTimestamp === undefined) throw new Error("GARMIN_FIT_TIMESTAMP_MISSING");

  const streams: StravaStreams = {
    time: { data: [] }, watts: { data: [] }, heartrate: { data: [] },
    cadence: { data: [] }, velocity_smooth: { data: [] }, altitude: { data: [] },
    temp: { data: [] }, grade_smooth: { data: [] },
  };
  let previousTime = -1;
  records.forEach((record, index) => {
    const timestamp = timestamps[index];
    if (timestamp === null) return;
    const seconds = Math.round((timestamp - firstTimestamp) / 1000);
    if (seconds <= previousTime) return;
    previousTime = seconds;
    const push = (key: string, value: unknown) => {
      streams[key].data!.push(num(value));
    };
    push("time", seconds);
    push("watts", record.power);
    push("heartrate", record.heart_rate ?? record.heartRate);
    push("cadence", record.cadence);
    push("velocity_smooth", record.enhanced_speed ?? record.speed);
    push("altitude", record.enhanced_altitude ?? record.altitude);
    push("temp", record.temperature);
    push("grade_smooth", record.grade);
  });
  return streams;
}

async function syncGarmin(profileId: string, supabase: ReturnType<typeof createServiceClient>) {
  const garmin = getGarminClient();
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = getDateDaysAgo(180);
  const startBoundary = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const activities: unknown[] = [];
  const pageSize = 100;

  for (let start = 0; start < 1000; start += pageSize) {
    const page = await garmin.searchActivities({ limit: pageSize, start });
    const rows = Array.isArray(page) ? page : [];
    activities.push(...rows);
    if (rows.length < pageSize) break;
    const last = rows[rows.length - 1] as Record<string, unknown>;
    const lastStart = dateTime(last.startTimeLocal ?? last.startTimeGMT ?? last.activityStartTime);
    if (lastStart && new Date(lastStart).getTime() < startBoundary) break;
  }

  const [{ data: existingFit, error: fitRowsError }, { data: ftpHistory, error: ftpHistoryError }] = await Promise.all([
    supabase.from("garmin_activity_streams").select("garmin_activity_id").eq("athlete_id", profileId),
    supabase.from("athlete_ftp_history").select("ftp_w,valid_from_date").eq("athlete_id", profileId).order("valid_from_date", { ascending: true }),
  ]);
  if (fitRowsError) throw new Error(fitRowsError.message);
  if (ftpHistoryError) throw new Error(ftpHistoryError.message);
  const fitIds = new Set((existingFit ?? []).map(row => String(row.garmin_activity_id)));
  const history = ftpHistory ?? [];

  let activityCount = 0, fitSaved = 0, fitSkipped = 0, fitFailed = 0;
  const maxFitDownloadsPerRun = 20;

  for (const activity of activities) {
    const a = activity as Record<string, unknown>;
    const activityId = text(a.activityId ?? a.activityID);
    const activityStart = dateTime(a.startTimeLocal ?? a.startTimeGMT ?? a.activityStartTime);
    if (!activityId || !activityStart || new Date(activityStart).getTime() < startBoundary) continue;
    const activityType = a.activityType as Record<string, unknown> | null;

    const row = {
      athlete_id: profileId,
      garmin_activity_id: activityId,
      activity_start: activityStart,
      sport: text(activityType?.typeKey ?? activityType?.typeName ?? a.sportTypeName ?? a.activityType),
      indoor: bool(a.indoor),
      duration_sec: num(a.duration) !== null ? Math.round(num(a.duration)!) : null,
      distance_m: num(a.distance),
      elevation_gain_m: num(a.elevationGain),
      avg_power_w: num(a.avgPower ?? a.averagePower),
      normalized_power_w: num(a.normPower ?? a.normalizedPower),
      max_power_w: num(a.maxPower),
      intensity_factor: num(a.intensityFactor),
      tss: num(a.trainingStressScore ?? a.tss),
      avg_hr: num(a.averageHR) !== null ? Math.round(num(a.averageHR)!) : null,
      max_hr: num(a.maxHR) !== null ? Math.round(num(a.maxHR)!) : null,
      avg_cadence: num(a.averageBikingCadenceInRevPerMinute ?? a.averageBikingCadence ?? a.averageCadence),
      calories: num(a.calories) !== null ? Math.round(num(a.calories)!) : null,
      training_load: num(a.activityTrainingLoad ?? a.trainingLoad),
      raw_data: a,
    };
    const { error } = await supabase.from("garmin_activities").upsert(row, { onConflict: "garmin_activity_id" });
    if (error) throw new Error(`Activity ${activityId}: ${error.message}`);
    activityCount++;

    if (!isCyclingActivity(a)) continue;
    if (fitIds.has(activityId)) { fitSkipped++; continue; }
    if (fitSaved + fitFailed >= maxFitDownloadsPerRun) continue;

    try {
      const zipBytes = await garmin.downloadActivity(activityId);
      const streams = await parseFitZip(zipBytes);
      const activityDate = activityStart.slice(0, 10);
      const historical = [...history].reverse().find(item => String(item.valid_from_date) <= activityDate);
      const effectiveFtp = historical ? Number(historical.ftp_w) : 238;
      const calculated = analyzeStravaStreams(streams, effectiveFtp);
      const metrics = {
        ...calculated,
        ftpW: effectiveFtp,
        ftpSource: historical ? "athlete_ftp_history" : "fallback_unverified",
        indoor: row.indoor,
        source: "garmin_fit",
        algorithmVersion: 1,
        dataQuality: {
          ...calculated.dataQuality,
          flags: historical ? calculated.dataQuality.flags : [...calculated.dataQuality.flags, "FTP_HISTORY_MISSING"],
        },
      };

      const path = `${profileId}/${activityId}.zip`;
      const { error: uploadError } = await supabase.storage.from("garmin-fit").upload(path, zipBytes, {
        contentType: "application/zip", upsert: true,
      });
      if (uploadError) throw new Error(`FIT_STORAGE: ${uploadError.message}`);

      const streamTypes = Object.keys(streams).filter(key => Array.isArray(streams[key]?.data));
      const { error: streamError } = await supabase.from("garmin_activity_streams").upsert({
        athlete_id: profileId,
        garmin_activity_id: activityId,
        activity_start: activityStart,
        duration_sec: calculated.durationSec,
        streams,
        metrics,
        stream_types: streamTypes,
        sample_count: calculated.sampleCount,
        raw_fit_path: path,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "garmin_activity_id" });
      if (streamError) throw streamError;

      await supabase.from("garmin_activities").update({ raw_fit_path: path })
        .eq("athlete_id", profileId).eq("garmin_activity_id", activityId);
      fitIds.add(activityId);
      fitSaved++;
    } catch (error) {
      fitFailed++;
      console.error("Garmin FIT import failed", { activityId, reason: error instanceof Error ? error.message : "UNKNOWN" });
    }
  }

  // Garmin limits sleep-summary ranges; split the 180-day history into <=31-day requests.
  let healthCount = 0;
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  while (cursor <= now) {
    const chunkStart = cursor.toISOString().slice(0, 10);
    const chunkEndDate = new Date(Math.min(now.getTime(), cursor.getTime() + 30 * 86400000));
    const chunkEnd = chunkEndDate.toISOString().slice(0, 10);
    const sleepSummaries = await garmin.getDailySleepSummaries(chunkStart, chunkEnd);
    const healthRows = Array.isArray(sleepSummaries)
      ? sleepSummaries
      : ((sleepSummaries as Record<string, unknown> | null)?.sleepSummaries as unknown[] | undefined) ?? [];
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
        athlete_id: profileId, date,
        sleep_minutes: sleepSeconds !== null ? Math.round(sleepSeconds / 60) : null,
        sleep_score: score,
        resting_hr: restingHr !== null ? Math.round(restingHr) : null,
        hrv_ms: hrv, hrv_status: hrvStatus, stress_avg: stress, body_battery: bodyBattery, raw_data: h,
      }, { onConflict: "athlete_id,date" });
      if (error) throw new Error(`Health ${date}: ${error.message}`);
      healthCount++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 31);
  }

  return { startDate, endDate, activities: activityCount, health: healthCount, fitSaved, fitSkipped, fitFailed, fitLimit: maxFitDownloadsPerRun };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const { data: profile, error } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, ...(await syncGarmin(profile.id, createServiceClient())) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GARMIN_SYNC_FAILED" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED_CRON" }, { status: 401 });
  }
  try {
    const supabase = createServiceClient();
    const { data: profiles, error } = await supabase.from("athlete_profile").select("id").limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profiles?.[0]) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, automatic: true, ...(await syncGarmin(profiles[0].id, supabase)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GARMIN_CRON_SYNC_FAILED" }, { status: 500 });
  }
}
