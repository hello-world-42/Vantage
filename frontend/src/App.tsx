import { useCallback, useState } from 'react';
import type { GeocodeResult } from '@vantage/shared';
import Globe from './components/Globe/Globe';
import Search from './components/Search/Search';
import LocationPanel from './components/LocationPanel/LocationPanel';
import Logo from './components/Logo';
import type { MapSelection } from './types';

export default function App() {
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Picking a location (click or search) opens the dashboard; the globe shifts to make room.
  const select = useCallback((selection: MapSelection) => {
    setSelected(selection);
    setPanelOpen(true);
  }, []);

  const selectSearchResult = useCallback(
    (r: GeocodeResult) => select({ lat: r.lat, lng: r.lng, name: r.name, source: 'search' }),
    [select],
  );

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#05060f]">
      <Globe selected={selected} panelOpen={panelOpen} onSelect={select} />

      {/* Logo with the search bar directly beneath it. The wrapper ignores pointer
          events so the globe stays draggable around them. */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
        <Logo />
        <div className="pointer-events-auto">
          <Search onSelect={selectSearchResult} />
        </div>
      </div>

      <LocationPanel location={selected} open={panelOpen} onOpen={() => setPanelOpen(true)} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
