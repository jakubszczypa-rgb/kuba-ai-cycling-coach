import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncStrava } from "@/lib/strava/server";

export const maxDuration = 60;

export async function POST() {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const { data: profile, error } = await auth.from("athlete_profile").select("id,current_ftp_w").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

    const ftpW = Number(profile.current_ftp_w) > 0 ? Number(profile.current_ftp_w) : 238;\n    const result = await syncStrava(profile.id, 180, ftpW);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "STRAVA_SYNC_FAILED" }, { status: 500 });
  }
}
