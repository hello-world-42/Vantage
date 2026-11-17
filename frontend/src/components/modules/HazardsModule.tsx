import type { HazardAlert, HazardsData } from '@vantage/shared/modules/hazards';
import type { EarthquakeData } from '@vantage/shared/modules/earthquakes';
import { formatDateTime, formatDistance, formatNumber, formatRelative } from './format';
import { Badge, Empty, SourceSection, type Tone } from './parts';

const SEVERITY_TONE: Record<string, Tone> = { Extreme: 'danger', Severe: 'danger', Moderate: 'warning', Minor: 'caution' };

function Alerts({ alerts, timeZone }: { alerts: HazardAlert[]; timeZone?: string | null }) {
  if (alerts.length === 0) return <Empty>No active weather alerts.</Empty>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <details className="group rounded-lg bg-white/5 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-100">{alert.event}</span>
                <span className="block text-xs text-slate-400">
                  {alert.areaDesc} · until {formatDateTime(alert.ends ?? alert.expires, timeZone)}
                </span>
              </span>
              <Badge tone={SEVERITY_TONE[alert.severity] ?? 'neutral'}>{alert.severity}</Badge>
            </summary>
            <div className="mt-2 flex flex-col gap-2 text-xs leading-relaxed text-slate-300">
              {alert.headline && <p className="m-0 font-medium">{alert.headline}</p>}
              <p className="m-0 whitespace-pre-line">{alert.description}</p>
              {alert.instruction && <p className="m-0 whitespace-pre-line text-slate-200">{alert.instruction}</p>}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function magnitudeTone(magnitude: number | null): Tone {
  if (magnitude === null) return 'neutral';
  if (magnitude >= 6) return 'danger';
  if (magnitude >= 4.5) return 'warning';
  if (magnitude >= 3) return 'caution';
  return 'neutral';
}

function Earthquakes({ data }: { data: EarthquakeData }) {
  const { radiusKm, minMagnitude } = data.query;
  if (data.earthquakes.length === 0) {
    return (
      <Empty>
        No earthquakes of magnitude {minMagnitude}+ within {formatNumber(radiusKm)} km in the past week.
      </Empty>
    );
  }
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {data.earthquakes.slice(0, 5).map((quake) => (
          <li key={quake.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-100">
                {quake.url ? (
                  <a href={quake.url} target="_blank" rel="noreferrer" className="text-slate-100 underline-offset-2 hover:underline">
                    {quake.place ?? 'Unnamed location'}
                  </a>
                ) : (
                  (quake.place ?? 'Unnamed location')
                )}
              </span>
              <span className="block text-xs text-slate-400">
                {formatRelative(quake.occurredAt)} · {formatDistance(quake.distanceKm)} away · {formatNumber(quake.depthKm)} km deep
              </span>
            </span>
            <Badge tone={magnitudeTone(quake.magnitude)}>M {quake.magnitude === null ? '?' : quake.magnitude.toFixed(1)}</Badge>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-xs text-slate-500">
        {data.earthquakes.length > 5 ? `Showing 5 of ${data.earthquakes.length}${data.possiblyTruncated ? '+' : ''}. ` : ''}
        Magnitude {minMagnitude}+ within {formatNumber(radiusKm)} km, past 7 days.
      </p>
    </>
  );
}

export default function HazardsModule({ data, timeZone }: { data: HazardsData; timeZone?: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <SourceSection title="Weather alerts" result={data.alerts}>
        {(alerts) => <Alerts alerts={alerts} timeZone={timeZone} />}
      </SourceSection>
      <SourceSection title="Recent earthquakes" result={data.earthquakes}>
        {(quakes) => <Earthquakes data={quakes} />}
      </SourceSection>
    </div>
  );
}
