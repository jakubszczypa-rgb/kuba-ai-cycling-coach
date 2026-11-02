import { createServiceClient } from "@/lib/supabase/service";
import { analyzeStravaStreams, type StravaStreams } from "@/lib/strava/stream-analysis";

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function stravaRedirectUri() {
  return `${required("NEXT_PUBLIC_APP_URL").replace(/\/$/, "")}/api/strava/callback`;
}

export function stravaAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: required("STRAVA_CLIENT_ID"),
    redirect_uri: stravaRedirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

async function exchange(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "STRAVA_TOKEN_EXCHANGE_FAILED");
  return data as Record<string, unknown>;
}

export async function refreshStravaToken(refreshToken: string) {
  return exchange(new URLSearchParams({
    client_id: required("STRAVA_CLIENT_ID"),
    client_secret: required("STRAVA_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

async function getConnection(athleteId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("strava_connections").select("*").eq("athlete_id", athleteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("STRAVA_NOT_CONNECTED");
  return { supabase, connection: data };
}

async function fetchActivityStreams(accessToken: string, activityId: number): Promise<StravaStreams | null> {
  const keys = "time,watts,heartrate,cadence,velocity_smooth,altitude,distance,temp,grade_smooth";
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${API}/activities/${activityId}/streams?keys=${keys}&key_by_type=true&resolution=high`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 60);
      if (attempt === 3) throw new Error("STRAVA_RATE_LIMITED_STREAMS");
      await new Promise(resolve => setTimeout(resolve, Math.max(5, Math.min(retryAfter, 120)) * 1000));
      continue;
    }
    if (response.status === 404 || response.status === 403) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || `STRAVA_STREAMS_HTTP_${response.status}`);
    return data as StravaStreams;
  }
  return null;
}

export async function syncStrava(athleteId: string, days = 180, ftpW = 238) {
  const { supabase, connection } = await getConnection(athleteId);
  let accessToken = connection.access_token as string;
  let refreshToken = connection.refresh_token as string;
  let expiresAt = Number(connection.expires_at);

  if (expiresAt < Math.floor(Date.now() / 1000) + 120) {
    const token = await refreshStravaToken(refreshToken);
    accessToken = String(token.access_token);
    refreshToken = String(token.refresh_token);
    expiresAt = Number(token.expires_at);
    await supabase.from("strava_connections").update({
      access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt,
      scope: typeof token.scope === "string" ? token.scope : connection.scope,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
  }

  const after = Math.floor(Date.now() / 1000) - days * 86400;
  const activities: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`${API}/athlete/activities?after=${after}&page=${page}&per_page=200`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "STRAVA_ACTIVITIES_FAILED");
    if (!Array.isArray(data)) break;
    activities.push(...(data as Record<string, unknown>[]));
    if (data.length === 0) break;
  }

  const { data: existingStreams, error: existingStreamsError } = await supabase
    .from("strava_activity_streams").select("strava_activity_id,sample_count").eq("athlete_id", athleteId);
  if (existingStreamsError) throw new Error(existingStreamsError.message);
  const streamIds = new Set((existingStreams ?? []).filter(x => Number(x.sample_count) > 0).map(x => Number(x.strava_activity_id)));
  const { data: ftpHistory, error: ftpHistoryError } = await supabase
    .from("athlete_ftp_history").select("ftp_w,valid_from_date")
    .eq("athlete_id", athleteId).order("valid_from_date", { ascending: true });
  if (ftpHistoryError) throw new Error(ftpHistoryError.message);
  const history = ftpHistory ?? [];

  let saved = 0;
  let streamsSaved = 0;
  let streamsSkipped = 0;
  let streamsFailed = 0;
  for (const a of activities) {
    const type = String(a.type ?? a.sport_type ?? "");
    if (!["Ride","VirtualRide","GravelRide","MountainBikeRide","EBikeRide","EMountainBikeRide"].includes(type)) continue;
    const start = typeof a.start_date === "string" ? a.start_date : null;
    const row = {
      athlete_id: athleteId,
      strava_activity_id: Number(a.id),
      activity_start: start,
      sport: typeof a.sport_type === "string" ? a.sport_type : type,
      name: typeof a.name === "string" ? a.name : null,
      indoor: Boolean(a.trainer) || type === "VirtualRide",
      duration_sec: Number.isFinite(Number(a.elapsed_time)) ? Math.round(Number(a.elapsed_time)) : null,
      distance_m: Number.isFinite(Number(a.distance)) ? Number(a.distance) : null,
      elevation_gain_m: Number.isFinite(Number(a.total_elevation_gain)) ? Number(a.total_elevation_gain) : null,
      avg_power_w: Number.isFinite(Number(a.average_watts)) ? Number(a.average_watts) : null,
      weighted_power_w: Number.isFinite(Number(a.weighted_average_watts)) ? Number(a.weighted_average_watts) : null,
      max_power_w: Number.isFinite(Number(a.max_watts)) ? Number(a.max_watts) : null,
      avg_hr: Number.isFinite(Number(a.average_heartrate)) ? Math.round(Number(a.average_heartrate)) : null,
      max_hr: Number.isFinite(Number(a.max_heartrate)) ? Math.round(Number(a.max_heartrate)) : null,
      avg_cadence: Number.isFinite(Number(a.average_cadence)) ? Number(a.average_cadence) : null,
      calories: Number.isFinite(Number(a.calories)) ? Math.round(Number(a.calories)) : null,
      suffer_score: Number.isFinite(Number(a.suffer_score)) ? Number(a.suffer_score) : null,
      raw_data: a,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("strava_activities").upsert(row, { onConflict: "strava_activity_id" });
    if (error) throw new Error(`Activity ${a.id}: ${error.message}`);
    saved++;

    const activityId = Number(a.id);
    if (streamIds.has(activityId)) { streamsSkipped++; continue; }
    try {
      const streams = await fetchActivityStreams(accessToken, activityId);
      if (!streams || !Array.isArray(streams.time?.data)) { streamsSkipped++; continue; }
      const activityDate = start ? start.slice(0, 10) : "";
      const historical = [...history].reverse().find(item => String(item.valid_from_date) <= activityDate);
      const effectiveFtp = historical ? Number(historical.ftp_w) : (ftpW > 0 ? ftpW : 238);
      const calculated = analyzeStravaStreams(streams, effectiveFtp);
      const metrics = {
        ...calculated,
        ftpW: effectiveFtp,
        ftpSource: historical ? "athlete_ftp_history" : "current_profile_fallback",
        indoor: Boolean(a.trainer) || type === "VirtualRide",
        dataQuality: {
          ...calculated.dataQuality,
          flags: historical ? calculated.dataQuality.flags : [...calculated.dataQuality.flags, "FTP_HISTORY_MISSING"],
        },
      };
      const streamTypes = Object.keys(streams).filter(key => Array.isArray(streams[key]?.data));
      const { error: streamError } = await supabase.from("strava_activity_streams").upsert({
        athlete_id: athleteId,
        strava_activity_id: activityId,
        activity_start: start,
        duration_sec: Number(a.elapsed_time) || metrics.durationSec,
        streams,
        metrics,
        stream_types: streamTypes,
        sample_count: metrics.sampleCount,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "strava_activity_id" });
      if (streamError) throw new Error(streamError.message);
      streamsSaved++;
    } catch (error) {
      if (error instanceof Error && error.message === "STRAVA_RATE_LIMITED_STREAMS") throw error;
      streamsFailed++;
    }
  }

  return { activities: saved, fetched: activities.length, days, streamsSaved, streamsSkipped, streamsFailed };
}

export async function reprocessStravaStreams(athleteId: string, limit = 100) {
  const supabase = createServiceClient();
  const [{ data: rows, error: rowsError }, { data: history, error: historyError }, { data: activities, error: activitiesError }] = await Promise.all([
    supabase.from("strava_activity_streams")
      .select("strava_activity_id,activity_start,streams")
      .eq("athlete_id", athleteId).order("activity_start", { ascending: true }).limit(limit),
    supabase.from("athlete_ftp_history").select("ftp_w,valid_from_date")
      .eq("athlete_id", athleteId).order("valid_from_date", { ascending: true }),
    supabase.from("strava_activities").select("strava_activity_id,indoor")
      .eq("athlete_id", athleteId),
  ]);
  if (rowsError) throw new Error(rowsError.message);
  if (historyError) throw new Error(historyError.message);
  if (activitiesError) throw new Error(activitiesError.message);
  const ftpRows = history ?? [];
  const indoorById = new Map((activities ?? []).map(a => [Number(a.strava_activity_id), Boolean(a.indoor)]));
  let updated = 0, failed = 0, missingFtpHistory = 0;
  for (const row of rows ?? []) {
    try {
      const date = row.activity_start ? String(row.activity_start).slice(0, 10) : "";
      const ftp = [...ftpRows].reverse().find(item => String(item.valid_from_date) <= date);
      const effectiveFtp = ftp ? Number(ftp.ftp_w) : 238;
      const result = analyzeStravaStreams(row.streams as StravaStreams, effectiveFtp);
      const hasHistoricalFtp = Boolean(ftp);
      const metrics = {
        ...result,
        ftpW: effectiveFtp,
        ftpSource: hasHistoricalFtp ? "athlete_ftp_history" : "fallback_unverified",
        indoor: indoorById.get(Number(row.strava_activity_id)) ?? null,
        dataQuality: {
          ...result.dataQuality,
          flags: hasHistoricalFtp ? result.dataQuality.flags : [...result.dataQuality.flags, "FTP_HISTORY_MISSING"],
        },
        algorithmVersion: 2,
        recalculatedAt: new Date().toISOString(),
      };
      if (!hasHistoricalFtp) missingFtpHistory++;
      const { error } = await supabase.from("strava_activity_streams")
        .update({ metrics, sample_count: result.sampleCount, fetched_at: new Date().toISOString() })
        .eq("athlete_id", athleteId).eq("strava_activity_id", row.strava_activity_id);
      if (error) throw new Error(error.message);
      updated++;
    } catch {
      failed++;
    }
  }
  return { processed: (rows ?? []).length, updated, failed, missingFtpHistory, hasMore: (rows ?? []).length === limit };
}
