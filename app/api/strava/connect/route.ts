import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stravaAuthorizeUrl } from "@/lib/strava/server";
import crypto from "node:crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL!));

  const state = crypto.randomBytes(32).toString("hex");
  const response = NextResponse.redirect(stravaAuthorizeUrl(state));
  response.cookies.set("strava_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}
