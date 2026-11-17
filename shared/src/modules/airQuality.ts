// Data shape inside the air quality card's ModuleResult (`result.data` when status is "ok").
// Concentrations are µg/m³. Null means the model has no value here, never zero.

export type AqiCategory =
  | "good"
  | "moderate"
  | "unhealthy_sensitive"
  | "unhealthy"
  | "very_unhealthy"
  | "hazardous";

export interface AirQualityData {
  /** UTC time the model values are valid for. */
  validAt: string;
  /** US EPA Air Quality Index, 0–500. */
  usAqi: number | null;
  category: AqiCategory | null;
  /** European AQI (different scale: about 0–100+). */
  europeanAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogenDioxide: number | null;
  sulphurDioxide: number | null;
  carbonMonoxide: number | null;
  units: { concentration: "µg/m³" };
}
