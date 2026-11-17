import type { AstronomyData, DaylightState } from '@vantage/shared/modules/astronomy';
import { compass, formatNumber, formatTime } from './format';
import { Headline, Stat, StatGrid } from './parts';

const DAYLIGHT: Record<DaylightState, string> = {
  day: 'Daytime',
  civil_twilight: 'Twilight',
  nautical_twilight: 'Deep twilight',
  astronomical_twilight: 'Almost fully dark',
  night: 'Night',
};

/** A little moon drawn from the phase: the lit part grows from the right, then shrinks from the right. */
function MoonIcon({ phase }: { phase: number }) {
  const r = 16;
  const waxing = phase <= 0.5;
  const fraction = waxing ? phase * 2 : (1 - phase) * 2; // 0 = new, 1 = full
  // The terminator is half an ellipse whose width goes from r (new) through 0 (quarter) to r (full).
  const rx = Math.abs(1 - 2 * fraction) * r;
  const litSide = waxing ? 1 : 0; // sweep flag for the outer limb
  const terminatorSweep = fraction < 0.5 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  const lit = `M 20 ${20 - r} A ${r} ${r} 0 0 ${litSide} 20 ${20 + r} A ${rx} ${r} 0 0 ${terminatorSweep} 20 ${20 - r} Z`;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="#1e293b" stroke="#334155" />
      <path d={lit} fill="#e2e8f0" />
    </svg>
  );
}

export default function AstronomyModule({ data, timeZone }: { data: AstronomyData; timeZone?: string | null }) {
  const { sun, moon } = data;
  const t = (iso: string | null) => formatTime(iso, timeZone);
  const sunLine =
    sun.polar === 'up' ? 'Midnight sun: the sun doesn’t set today' : sun.polar === 'down' ? 'Polar night: the sun doesn’t rise today' : null;

  return (
    <>
      <Headline
        value={DAYLIGHT[sun.daylight]}
        label={sunLine ?? `Sun ${sun.altitudeDeg >= 0 ? `${formatNumber(sun.altitudeDeg)}° above` : `${formatNumber(-sun.altitudeDeg)}° below`} the horizon, toward ${compass(sun.azimuthDeg)}`}
      />
      <StatGrid>
        <Stat label="Sunrise" value={t(sun.sunrise)} hint={sun.dawn ? `first light ${t(sun.dawn)}` : undefined} />
        <Stat label="Sunset" value={t(sun.sunset)} hint={sun.dusk ? `last light ${t(sun.dusk)}` : undefined} />
        <Stat label="Solar noon" value={t(sun.solarNoon)} />
        <Stat label="Fully dark" value={sun.nightStart ? `${t(sun.nightStart)} – ${t(sun.nightEnd)}` : '—'} hint={sun.nightStart ? undefined : 'not tonight'} />
      </StatGrid>

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
        <MoonIcon phase={moon.phase} />
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium text-slate-100">
            {moon.phaseName} · {formatNumber(moon.illumination * 100)}% lit
          </p>
          <p className="m-0 text-xs text-slate-400">
            {moon.altitudeDeg >= 0 ? `Up now, toward ${compass(moon.azimuthDeg)}` : 'Below the horizon'}
            {moon.nextRise && ` · rises ${t(moon.nextRise)}`}
            {moon.nextSet && ` · sets ${t(moon.nextSet)}`}
          </p>
        </div>
      </div>
      {timeZone && <p className="m-0 mt-3 text-xs text-slate-500">Times are local to this place ({timeZone.replace(/_/g, ' ')}).</p>}
    </>
  );
}
