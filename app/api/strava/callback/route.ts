import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stravaRedirectUri } from "@/lib/strava/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (!user) return NextResponse.redirect(new URL("/login", appUrl));
  if (error || !code || !state) return NextResponse.redirect(new URL("/profile?strava=error", appUrl));

  const cookieState = request.headers.get("cookie")?.match(/(?:^|; )strava_oauth_state=([^;]*)/)?.[1];
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL("/profile?strava=state_error", appUrl));
  }

  const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: stravaRedirectUri(),
    }),
  });

  const token = await tokenResponse.json();

  if (!tokenResponse.ok) {
    const reason = typeof token?.message === "string" ? token.message : `HTTP_${tokenResponse.status}`;
    return NextResponse.redirect(
      new URL(`/profile?strava=token_error&reason=${encodeURIComponent(reason.slice(0, 120))}`, appUrl)
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("athlete_profile")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.redirect(new URL("/profile?strava=profile_error", appUrl));
  }

  const service = createServiceClient();
  const { error: saveError } = await service.from("strava_connections").upsert({
    athlete_id: profile.id,
    strava_athlete_id: Number(token.athlete?.id),
    access_token: String(token.access_token),
    refresh_token: String(token.refresh_token),
    expires_at: Number(token.expires_at),
    scope: typeof token.scope === "string" ? token.scope : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_id" });

  if (saveError) return NextResponse.redirect(new URL("/profile?strava=save_error", appUrl));

  const response = NextResponse.redirect(new URL("/profile?strava=connected", appUrl));
  response.cookies.set("strava_oauth_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
