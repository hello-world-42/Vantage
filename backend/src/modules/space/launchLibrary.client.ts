// Upcoming rocket launches worldwide from Launch Library 2 (The Space Devs).
// https://ll.thespacedevs.com/docs/  · free tier: 15 requests/hour, no key.
//
// Returns the whole list; it's one global list, cached under one key and filtered by
// distance in space.service.ts. Never call this per grid cell.
import { z } from "zod";
import { fetchJson, type HttpOptions } from "../../lib/http.js";
import type { Throttle } from "../../lib/throttle.js";

export const LAUNCH_LIBRARY_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/";

const named = z.object({ name: z.string() }).nullish();

const launchSchema = z.object({
  id: z.string(),
  name: z.string(),
  net: z.string(),
  net_precision: named,
  status: z.object({ name: z.string(), abbrev: z.string().nullish() }).nullish(),
  launch_service_provider: named,
  rocket: z.object({ configuration: z.object({ full_name: z.string().nullish(), name: z.string().nullish() }).nullish() }).nullish(),
  mission: z.object({ name: z.string().nullish(), type: z.string().nullish() }).nullish(),
  pad: z.object({
    name: z.string(),
    // Numbers in API 2.3; older versions sent strings.
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
    country: z.object({ alpha_2_code: z.string().nullish() }).nullish(),
    location: z.object({ name: z.string() }).nullish(),
  }),
  image: z.object({ image_url: z.string().nullish() }).nullish(),
  webcast_live: z.boolean().nullish(),
});

const responseSchema = z.object({ results: z.array(z.unknown()) });

/** A launch as the backend keeps it, before distance is added for a location. */
export interface LaunchRecord {
  id: string;
  name: string;
  net: string;
  netPrecision: string | null;
  status: string;
  provider: string | null;
  rocket: string | null;
  mission: string | null;
  missionType: string | null;
  pad: { name: string; location: string; lat: number; lng: number; countryCode: string | null };
  imageUrl: string | null;
  webcastLive: boolean;
}

export interface LaunchLibraryOptions extends Pick<HttpOptions, "fetch" | "timeoutMs"> {
  /** How many launches to ask for (max 100 per page). */
  limit?: number;
  throttle?: Throttle;
}

export function toLaunchRecord(raw: z.infer<typeof launchSchema>): LaunchRecord {
  return {
    id: raw.id,
    name: raw.name,
    net: raw.net,
    netPrecision: raw.net_precision?.name ?? null,
    status: raw.status?.abbrev ?? raw.status?.name ?? "Unknown",
    provider: raw.launch_service_provider?.name ?? null,
    rocket: raw.rocket?.configuration?.full_name ?? raw.rocket?.configuration?.name ?? null,
    mission: raw.mission?.name ?? null,
    missionType: raw.mission?.type ?? null,
    pad: {
      name: raw.pad.name,
      location: raw.pad.location?.name ?? raw.pad.name,
      lat: raw.pad.latitude,
      lng: raw.pad.longitude,
      countryCode: raw.pad.country?.alpha_2_code ?? null,
    },
    imageUrl: raw.image?.image_url ?? null,
    webcastLive: raw.webcast_live ?? false,
  };
}

/** Fetches upcoming launches. Entries that don't match the expected shape are skipped, not fatal. */
export async function fetchUpcomingLaunches(options: LaunchLibraryOptions = {}): Promise<LaunchRecord[]> {
  options.throttle?.take();
  const url = new URL(LAUNCH_LIBRARY_URL);
  url.searchParams.set("limit", String(options.limit ?? 40));
  url.searchParams.set("mode", "normal");
  url.searchParams.set("format", "json");

  const body = responseSchema.parse(
    await fetchJson(url, { service: "Launch Library", timeoutMs: options.timeoutMs ?? 8_000, fetch: options.fetch }),
  );
  const launches: LaunchRecord[] = [];
  for (const item of body.results) {
    const parsed = launchSchema.safeParse(item);
    if (parsed.success && Number.isFinite(parsed.data.pad.latitude) && Number.isFinite(parsed.data.pad.longitude)) {
      launches.push(toLaunchRecord(parsed.data));
    }
  }
  return launches;
}
