import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reprocessStravaStreams } from "@/lib/strava/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { data: profile, error } = await auth.from("athlete_profile")
      .select("id").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const offset = Number.isInteger(body?.offset) && body.offset >= 0 ? body.offset : 0;
    const result = await reprocessStravaStreams(profile.id, 75, offset);
    return NextResponse.json({ ok: true, offset, ...result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "STRAVA_REPROCESS_FAILED",
    }, { status: 500 });
  }
}
