import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { data: profile } = await supabase.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  const activityId = new URL(request.url).searchParams.get("activityId");
  if (!activityId || !/^[0-9]+$/.test(activityId)) return NextResponse.json({ error: "INVALID_ACTIVITY_ID" }, { status: 400 });
  const { data, error } = await supabase.from("strava_activity_streams").select("strava_activity_id,activity_start,duration_sec,streams,metrics,sample_count").eq("athlete_id", profile.id).eq("strava_activity_id", Number(activityId)).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "STREAMS_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(data);
}
