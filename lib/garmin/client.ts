import { GarminPersonalApiClient } from "@likenttt/connect-personal-api-ts";

export function getGarminClient() {
  const apiKey = process.env.GARMIN_PERSONAL_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GARMIN_PERSONAL_API_KEY is not configured");
  }

  const region = process.env.GARMIN_REGION === "cn" ? "cn" : "global";

  return new GarminPersonalApiClient({
    apiKey,
    region,
    timeoutMs: 30_000,
  });
}

export function getDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
