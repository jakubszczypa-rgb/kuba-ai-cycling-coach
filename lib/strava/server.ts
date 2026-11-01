import { createServiceClient } from "@/lib/supabase/service";

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

export async function syncStrava(athleteId: string, days = 180) {
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

  let saved = 0;
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
  }

  return { activities: saved, fetched: activities.length, days };
}
