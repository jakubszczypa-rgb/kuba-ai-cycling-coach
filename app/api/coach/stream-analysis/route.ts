import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeStravaStreams, type StravaStreams } from "@/lib/strava/stream-analysis";

export const maxDuration = 60;

export async function POST() {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
 if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_NOT_CONFIGURED" }, { status: 503 });
 const { data: profile } = await supabase.from("athlete_profile").select("id,name,current_ftp_w,primary_goal").eq("user_id", user.id).maybeSingle();
 if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
 const since = new Date(Date.now() - 90 * 86400000).toISOString();
 const { data: rows, error } = await supabase.from("strava_activity_streams").select("activity_start,duration_sec,streams,sample_count").eq("athlete_id", profile.id).gte("activity_start", since).order("activity_start", { ascending: false }).limit(60);
 if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 if (!rows?.length) return NextResponse.json({ error: "NO_STREAM_DATA" }, { status: 409 });
 const ftpW = Number(profile.current_ftp_w) > 0 ? Number(profile.current_ftp_w) : 238;
 const sessions = rows.map(row => ({ date: row.activity_start, durationMin: Math.round(Number(row.duration_sec ?? 0) / 60), samples: row.sample_count, metrics: analyzeStravaStreams(row.streams as StravaStreams, ftpW) }));
 const prompt = "Przeanalizuj po polsku treningi kolarskie z 90 dni. Szukaj dryfu tętna, relacji moc/HR, odpowiedzi HR na interwały i spadku HR w przerwach. Podawaj liczby, oddziel obserwacje od hipotez, uwzględnij ograniczenia danych. FTP " + ftpW + " W. Dane: " + JSON.stringify(sessions);
 const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", messages: [{ role: "system", content: "Jesteś analitykiem treningu kolarskiego. Nie diagnozuj medycznie i nie wymyślaj danych." }, { role: "user", content: prompt }], max_completion_tokens: 2200 }) });
 const result = await response.json();
 if (!response.ok) return NextResponse.json({ error: result?.error?.message ?? "OPENAI_ANALYSIS_FAILED" }, { status: 502 });
 const analysis = result?.choices?.[0]?.message?.content;
 if (typeof analysis !== "string" || !analysis.trim()) return NextResponse.json({ error: "EMPTY_AI_ANALYSIS" }, { status: 502 });
 return NextResponse.json({ analysis, sessionsAnalyzed: sessions.length, ftpW, generatedAt: new Date().toISOString() });
}
