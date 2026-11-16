import type { WeatherData } from "@vantage/shared/modules/weather";
import { fetchOpenMeteoWeather, type WeatherClientOptions } from "./openMeteo.client.js";

export type WeatherResult = { status: "ok"; source: "Open-Meteo"; data: WeatherData };

/** Standalone provider; the registry/aggregator owner adds caching and ModuleResult wrapping. */
export async function fetchWeather(
  lat: number,
  lng: number,
  options: WeatherClientOptions = {},
): Promise<WeatherResult> {
  const response = await fetchOpenMeteoWeather(lat, lng, options);
  const current = response.current;
  return {
    status: "ok", source: "Open-Meteo",
    data: {
      validAt: new Date(current.time * 1000).toISOString(),
      intervalSeconds: current.interval,
      temperature: current.temperature_2m, feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m, windDirection: current.wind_direction_10m,
      precipitation: current.precipitation, weatherCode: current.weather_code,
      isDay: current.is_day === null ? null : current.is_day === 1,
      dailyUvMax: { dateUtc: new Date(response.daily.time[0] * 1000).toISOString().slice(0, 10), index: response.daily.uv_index_max[0] },
      units: { temperature: "°C", humidity: "%", windSpeed: "km/h", windDirection: "°", precipitation: "mm" },
      attribution: {
        text: "Weather data by Open-Meteo", url: "https://open-meteo.com/", license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        changes: "Field names and timestamps normalized; model values unchanged.",
      },
    },
  };
}
