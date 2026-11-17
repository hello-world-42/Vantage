// Data shape inside the ocean card's ModuleResult (`result.data` when status is "ok").
// The card is not_applicable for inland points. Null means no value for that field.

export interface OceanData {
  /** UTC time the model values are valid for. */
  validAt: string;
  /** Significant wave height, metres. */
  waveHeight: number | null;
  /** Direction waves come from, compass degrees. */
  waveDirection: number | null;
  /** Seconds between waves. */
  wavePeriod: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
  /** °C */
  seaSurfaceTemperature: number | null;
  /** km/h */
  currentSpeed: number | null;
  /** Direction the current flows toward, compass degrees. */
  currentDirection: number | null;
  units: { height: "m"; period: "s"; temperature: "°C"; speed: "km/h"; direction: "°" };
}
