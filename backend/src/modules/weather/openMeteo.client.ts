import { z } from "zod";

const timeSchema = z.number().int().min(0).max(253402300799);
const responseSchema = z.object({
  current_units: z.object({
    time: z.literal("unixtime"), interval: z.literal("seconds"),
    temperature_2m: z.literal("°C"), apparent_temperature: z.literal("°C"),
    relative_humidity_2m: z.literal("%"), wind_speed_10m: z.literal("km/h"),
    wind_direction_10m: z.literal("°"), precipitation: z.literal("mm"),
  }),
  current: z.object({
    time: timeSchema, interval: z.number().int().positive(),
    temperature_2m: z.number().nullable(), apparent_temperature: z.number().nullable(),
    relative_humidity_2m: z.number().min(0).max(100).nullable(),
    wind_speed_10m: z.number().nonnegative().nullable(),
    wind_direction_10m: z.number().min(0).max(360).nullable(),
    precipitation: z.number().nonnegative().nullable(),
    weather_code: z.number().int().min(0).max(99).nullable(),
    is_day: z.union([z.literal(0), z.literal(1)]).nullable(),
  }),
  daily_units: z.object({ time: z.literal("unixtime"), uv_index_max: z.literal("") }),
  daily: z.object({
    time: z.array(timeSchema).length(1),
    uv_index_max: z.array(z.number().nonnegative().nullable()).length(1),
  }),
});

export type OpenMeteoWeather = z.infer<typeof responseSchema>;
export interface WeatherClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Allows a caller to cancel work; the five-second timeout still applies. */
  signal?: AbortSignal;
}
export class WeatherClientError extends Error {
  constructor(
    public readonly code: "invalid_input" | "configuration" | "http" | "timeout" | "aborted" | "network" | "invalid_response",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "WeatherClientError";
  }
}

/** Keyless public forecast API. No configuration/environment reads or automatic retries. */
export async function fetchOpenMeteoWeather(
  lat: number,
  lng: number,
  options: WeatherClientOptions = {},
): Promise<OpenMeteoWeather> {
  if (!z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse({ lat, lng }).success) {
    throw new WeatherClientError("invalid_input", "Provide valid weather coordinates.");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new WeatherClientError("configuration", "Weather timeout must be between 1 and 60000 milliseconds.");
  }
  if (options.signal?.aborted) throw new WeatherClientError("aborted", "Weather request was cancelled.");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const abortError = () => timeout.aborted
    ? new WeatherClientError("timeout", "Weather request timed out.")
    : new WeatherClientError("aborted", "Weather request was cancelled.");

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  const parameters = {
    latitude: String(lat), longitude: String(lng),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day",
    daily: "uv_index_max", forecast_days: "1", timezone: "GMT", timeformat: "unixtime",
    temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm", cell_selection: "nearest",
  };
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

  try {
    const response = await (options.fetch ?? fetch)(url, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) throw new WeatherClientError("http", `Weather request failed (HTTP ${response.status}).`, response.status);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) throw abortError();
      throw new WeatherClientError("invalid_response", "Weather service returned unreadable data.");
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new WeatherClientError("invalid_response", "Weather service returned unexpected data or units.");
    const current = parsed.data.current;
    if ([current.temperature_2m, current.apparent_temperature, current.relative_humidity_2m,
      current.wind_speed_10m, current.wind_direction_10m, current.precipitation, current.weather_code].every((value) => value === null)) {
      throw new WeatherClientError("invalid_response", "Current weather data is unavailable for this location.");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof WeatherClientError) throw error;
    if (signal.aborted) throw abortError();
    throw new WeatherClientError("network", "Could not reach the weather service.");
  }
}
