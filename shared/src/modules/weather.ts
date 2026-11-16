/** Stable weather payload for the dashboard. Null means unavailable, never zero. */
export interface WeatherData {
  /** UTC forecast/model timestamp, not a station observation time. */
  validAt: string;
  intervalSeconds: number;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  /** Accumulation over intervalSeconds preceding validAt. */
  precipitation: number | null;
  weatherCode: number | null;
  isDay: boolean | null;
  /** Maximum forecast UV for this UTC day; not the instantaneous UV index. */
  dailyUvMax: { dateUtc: string; index: number | null };
  units: { temperature: "°C"; humidity: "%"; windSpeed: "km/h"; windDirection: "°"; precipitation: "mm" };
  attribution: { text: string; url: string; license: string; licenseUrl: string; changes: string };
}
