import type { ModuleId } from '@vantage/shared';
import { useLocationData } from '../../hooks/useLocationData';
import type { MapSelection } from '../../types';
import ModuleCard from '../modules/ModuleCard';

const MODULE_LABELS: Record<ModuleId, string> = {
  weather: 'Weather & UV',
  airQuality: 'Air quality',
  astronomy: 'Astronomy',
  space: 'Space',
  hazards: 'Hazards & alerts',
  ocean: 'Ocean',
  skyConditions: 'Sky conditions',
};
/** Display order. Modules the backend returns that aren't listed here are appended after these. */
const MODULE_ORDER = Object.keys(MODULE_LABELS) as ModuleId[];

// PLACEHOLDER: shows each module's data as JSON until the real module components
// (WeatherModule, HazardsModule, ...) exist. Swap each one in as its component is built.
function RawData({ data }: { data: unknown }) {
  return (
    <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-slate-300">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

/** Dashboard contents for a selected location: one ModuleCard per module the backend returns. */
export default function LocationDetails({ location }: { location: MapSelection }) {
  const state = useLocationData(location);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <ModuleCard key={i} title="" loading>
            {() => null}
          </ModuleCard>
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ModuleCard
        title="Location data"
        result={{ status: 'error', message: "Couldn't load data for this location." }}
        onRetry={state.reload}
      >
        {() => null}
      </ModuleCard>
    );
  }

  const present = Object.keys(state.data.modules) as ModuleId[];
  const ids = [...MODULE_ORDER.filter((id) => present.includes(id)), ...present.filter((id) => !MODULE_ORDER.includes(id))];

  if (ids.length === 0) {
    return <p className="m-0 text-sm text-slate-400">No data modules are available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {ids.map((id) => (
        <ModuleCard key={id} title={MODULE_LABELS[id] ?? id} result={state.data.modules[id]} onRetry={state.reload}>
          {(data) => <RawData data={data} />}
        </ModuleCard>
      ))}
    </div>
  );
}
