import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncStrava } from "@/lib/strava/server";

export async function POST() {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { data: profile, error } = await auth.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

    const result = await syncStrava(profile.id, 180);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "STRAVA_SYNC_FAILED" }, { status: 500 });
  }
}
