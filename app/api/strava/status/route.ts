import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const { data: profile } = await auth.from("athlete_profile").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ connected: false });

  const service = createServiceClient();
  const { data: connection } = await service.from("strava_connections").select("strava_athlete_id,scope,updated_at").eq("athlete_id", profile.id).maybeSingle();
  return NextResponse.json({ connected: Boolean(connection), athleteId: connection?.strava_athlete_id ?? null, scope: connection?.scope ?? null, updatedAt: connection?.updated_at ?? null });
}
