// Small formatting helpers shared by the dashboard cards.

/** "6:42 PM" in the location's own time zone (falls back to the viewer's). */
export function formatTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timeZone ?? undefined });
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

/** "Tue, Nov 17, 6:42 PM" in the location's time zone. */
export function formatDateTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return date.toLocaleString([], { ...options, timeZone: timeZone ?? undefined });
  } catch {
    return date.toLocaleString([], options);
  }
}

/** "in 3 h", "in 2 days", "5 min ago". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now;
  if (Number.isNaN(diffMs)) return '';
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  let text: string;
  if (minutes < 1) return 'now';
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 48 * 60) text = `${Math.round(minutes / 60)} h`;
  else text = `${Math.round(minutes / 1440)} days`;
  return diffMs >= 0 ? `in ${text}` : `${text} ago`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 0–360° to "NNE". */
export function compass(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return '—';
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

export const cToF = (celsius: number) => (celsius * 9) / 5 + 32;
export const kmToMiles = (km: number) => km * 0.621371;

/** "12°C / 54°F" */
export function formatTemperature(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined) return '—';
  return `${Math.round(celsius)}°C / ${Math.round(cToF(celsius))}°F`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** "1,240 km (771 mi)" */
export function formatDistance(km: number): string {
  return `${formatNumber(km)} km (${formatNumber(kmToMiles(km))} mi)`;
}

/** WMO weather interpretation codes (used by Open-Meteo). */
export function describeWeather(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'Unknown conditions';
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code === 61) return 'Light rain';
  if (code === 63) return 'Rain';
  if (code === 65) return 'Heavy rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code === 71) return 'Light snow';
  if (code === 73) return 'Snow';
  if (code === 75) return 'Heavy snow';
  if (code === 77) return 'Snow grains';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Unknown conditions';
}

/** UV index bands (WHO). */
export function describeUv(index: number | null | undefined): string {
  if (index === null || index === undefined) return '';
  if (index < 3) return 'Low';
  if (index < 6) return 'Moderate';
  if (index < 8) return 'High';
  if (index < 11) return 'Very high';
  return 'Extreme';
}
