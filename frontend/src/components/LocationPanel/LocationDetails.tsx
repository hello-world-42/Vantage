import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { LocationResponse, ModuleId } from '@vantage/shared';
import type { AirQualityData } from '@vantage/shared/modules/airQuality';
import type { AstronomyData } from '@vantage/shared/modules/astronomy';
import type { HazardsData } from '@vantage/shared/modules/hazards';
import type { OceanData } from '@vantage/shared/modules/ocean';
import type { SkyConditionsData } from '@vantage/shared/modules/skyConditions';
import type { SpaceData } from '@vantage/shared/modules/space';
import type { WeatherData } from '@vantage/shared/modules/weather';
import { useLocationData } from '../../hooks/useLocationData';
import type { MapSelection } from '../../types';
import Attribution from '../Attribution';
import SaveLocationButton from '../favorites/SaveLocationButton';
import AirQualityModule from '../modules/AirQualityModule';
import AstronomyModule from '../modules/AstronomyModule';
import HazardsModule from '../modules/HazardsModule';
import ModuleCard from '../modules/ModuleCard';
import OceanModule from '../modules/OceanModule';
import SkyConditionsModule from '../modules/SkyConditionsModule';
import SpaceModule from '../modules/SpaceModule';
import WeatherModule from '../modules/WeatherModule';
import { formatTime } from '../modules/format';

const MODULE_LABELS: Record<ModuleId, string> = {
  weather: 'Weather & UV',
  airQuality: 'Air quality',
  hazards: 'Hazards & alerts',
  astronomy: 'Sun & moon',
  space: 'Space',
  ocean: 'Ocean',
  skyConditions: 'Sky conditions',
};
/** Display order. Modules the backend returns that aren't listed here are appended after these. */
const MODULE_ORDER = Object.keys(MODULE_LABELS) as ModuleId[];

/**
 * Renders one module's data. The backend builds each module's data in the matching shape
 * from shared/src/modules/*.ts; the casts below are where the frontend relies on that.
 */
function renderModule(id: ModuleId, data: unknown, timeZone: string | null): ReactNode {
  switch (id) {
    case 'weather':
      return <WeatherModule data={data as WeatherData} />;
    case 'airQuality':
      return <AirQualityModule data={data as AirQualityData} />;
    case 'hazards':
      return <HazardsModule data={data as HazardsData} timeZone={timeZone} />;
    case 'astronomy':
      return <AstronomyModule data={data as AstronomyData} timeZone={timeZone} />;
    case 'space':
      return <SpaceModule data={data as SpaceData} timeZone={timeZone} />;
    case 'ocean':
      return <OceanModule data={data as OceanData} />;
    case 'skyConditions':
      return <SkyConditionsModule data={data as SkyConditionsData} />;
    default:
      // A module the frontend doesn't know yet: show its data rather than nothing.
      return (
        <pre className="m-0 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-slate-300">{JSON.stringify(data, null, 2)}</pre>
      );
  }
}

interface LocationDetailsProps {
  location: MapSelection;
  onRequestLogin?: () => void;
  onPlaceName?: (location: MapSelection, name: string) => void;
}

function Summary({ location, data, onRequestLogin }: { location: MapSelection; data: LocationResponse; onRequestLogin?: () => void }) {
  const placeName = location.name ?? data.place?.name;
  const label = placeName ?? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`;
  return (
    <div className="flex flex-col gap-2">
      {(data.place?.context || data.timeZone) && (
        <p className="m-0 text-xs text-slate-400">
          {data.place?.context}
          {data.place?.context && data.timeZone && ' · '}
          {data.timeZone && `Local time ${formatTime(data.generatedAt, data.timeZone)}`}
        </p>
      )}
      <SaveLocationButton
        lat={location.lat}
        lng={location.lng}
        label={label}
        city={data.place?.name ?? null}
        country={data.countryCode}
        onRequestLogin={onRequestLogin}
      />
    </div>
  );
}

/** Dashboard contents for a selected location: one card per module the backend returns. */
export default function LocationDetails({ location, onRequestLogin, onPlaceName }: LocationDetailsProps) {
  const state = useLocationData(location);
  const placeName = state.status === 'ready' ? state.data.place?.name : undefined;

  // Tell the page the place's name so the header can show it instead of "Dropped pin".
  useEffect(() => {
    if (placeName && !location.name) onPlaceName?.(location, placeName);
  }, [placeName, location, onPlaceName]);

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

  const { data } = state;
  const present = Object.keys(data.modules) as ModuleId[];
  const ids = [...MODULE_ORDER.filter((id) => present.includes(id)), ...present.filter((id) => !MODULE_ORDER.includes(id))];
  const timeZone = data.timeZone ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Summary location={location} data={data} onRequestLogin={onRequestLogin} />
      {ids.length === 0 ? (
        <p className="m-0 text-sm text-slate-400">No data modules are available yet.</p>
      ) : (
        ids.map((id) => (
          <ModuleCard key={id} title={MODULE_LABELS[id] ?? id} result={data.modules[id]} onRetry={state.reload}>
            {(moduleData) => renderModule(id, moduleData, timeZone)}
          </ModuleCard>
        ))
      )}
      {/* Open-Meteo's licence (CC BY 4.0) requires credit wherever its data is shown. */}
      <Attribution className="mt-1" />
    </div>
  );
}
