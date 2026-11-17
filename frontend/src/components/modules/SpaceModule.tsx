import type { AuroraData, AuroraLevel, Launch, LaunchesData, SatellitePass, SpaceData } from '@vantage/shared/modules/space';
import { formatDateTime, formatDistance, formatNumber, formatRelative, formatTime } from './format';
import { Badge, Empty, SourceSection, type Tone } from './parts';

const AURORA: Record<AuroraLevel, { label: string; tone: Tone; text: string }> = {
  none: { label: 'Unlikely', tone: 'neutral', text: 'Aurora isn’t expected overhead here right now.' },
  low: { label: 'Slight chance', tone: 'caution', text: 'A faint glow near the horizon is possible on a dark, clear night.' },
  moderate: { label: 'Possible', tone: 'good', text: 'Aurora may be visible overhead if the sky is dark and clear.' },
  high: { label: 'Likely', tone: 'good', text: 'Strong aurora is likely overhead if the sky is dark and clear.' },
};

function Aurora({ data }: { data: AuroraData }) {
  const level = AURORA[data.level];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm text-slate-100">{formatNumber(data.probability)}% chance overhead</p>
        <Badge tone={level.tone}>{level.label}</Badge>
      </div>
      <p className="m-0 mt-1 text-xs text-slate-400">
        {level.text}
        {data.kp !== null && ` Global activity: Kp ${formatNumber(data.kp, 1)}${data.kp >= 5 ? ' (geomagnetic storm)' : ''}.`}
      </p>
    </div>
  );
}

function LaunchRow({ launch, timeZone, showDistance }: { launch: Launch; timeZone?: string | null; showDistance?: boolean }) {
  const exact = launch.netPrecision === null || ['Second', 'Minute', 'Hour'].includes(launch.netPrecision);
  return (
    <li className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm text-slate-100">{launch.name}</span>
        <Badge tone={launch.status === 'Go' ? 'good' : 'neutral'}>{launch.webcastLive ? 'Live' : launch.status}</Badge>
      </div>
      <p className="m-0 mt-0.5 text-xs text-slate-400">
        {exact ? `${formatDateTime(launch.net, timeZone)} (${formatRelative(launch.net)})` : `Around ${formatDateTime(launch.net, timeZone)}`}
      </p>
      <p className="m-0 text-xs text-slate-400">
        {launch.pad.location}
        {showDistance && ` · ${formatDistance(launch.distanceKm)} away`}
      </p>
    </li>
  );
}

function Launches({ data, timeZone }: { data: LaunchesData; timeZone?: string | null }) {
  if (data.upcoming.length === 0) return <Empty>No upcoming launches are listed.</Empty>;
  const nearbyIds = new Set(data.nearby.map((launch) => launch.id));
  const others = data.upcoming.filter((launch) => !nearbyIds.has(launch.id)).slice(0, data.nearby.length > 0 ? 3 : 4);
  return (
    <div className="flex flex-col gap-2">
      {data.nearby.length > 0 && (
        <>
          <p className="m-0 text-xs font-medium text-emerald-200">Near here (within {formatNumber(data.nearbyRadiusKm)} km)</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.nearby.slice(0, 3).map((launch) => (
              <LaunchRow key={launch.id} launch={launch} timeZone={timeZone} showDistance />
            ))}
          </ul>
          {others.length > 0 && <p className="m-0 mt-1 text-xs font-medium text-slate-400">Elsewhere in the world</p>}
        </>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {others.map((launch) => (
          <LaunchRow key={launch.id} launch={launch} timeZone={timeZone} />
        ))}
      </ul>
    </div>
  );
}

function Passes({ passes, timeZone }: { passes: SatellitePass[]; timeZone?: string | null }) {
  if (passes.length === 0) return <Empty>No visible passes in the next two days.</Empty>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {passes.slice(0, 4).map((pass) => (
        <li key={`${pass.satelliteId}-${pass.start}`} className="rounded-lg bg-white/5 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm text-slate-100">{pass.satelliteName}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatRelative(pass.start)}</span>
          </div>
          <p className="m-0 mt-0.5 text-xs text-slate-400">
            {formatDateTime(pass.start, timeZone)} – {formatTime(pass.end, timeZone)} · {pass.startCompass} → {pass.endCompass}, up to{' '}
            {formatNumber(pass.maxElevationDeg)}° high
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function SpaceModule({ data, timeZone }: { data: SpaceData; timeZone?: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <SourceSection title="Aurora" result={data.aurora}>
        {(aurora) => <Aurora data={aurora} />}
      </SourceSection>
      <SourceSection title="Satellites you can see" result={data.satellitePasses}>
        {(passes) => <Passes passes={passes} timeZone={timeZone} />}
      </SourceSection>
      <SourceSection title="Rocket launches" result={data.launches}>
        {(launches) => <Launches data={launches} timeZone={timeZone} />}
      </SourceSection>
    </div>
  );
}
