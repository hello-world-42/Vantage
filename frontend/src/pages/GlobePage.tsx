import { useCallback, useState } from 'react';
import type { GeocodeResult } from '@vantage/shared';
import Globe from '../components/Globe/Globe';
import LocationPanel from '../components/LocationPanel/LocationPanel';
import Search from '../components/Search/Search';
import TopBar from '../components/TopBar';
import { useAuthModal } from '../hooks/useAuthModal';
import type { MapSelection } from '../types';

/** The globe + dashboard (Figma screens 02, 03, 06). Lives at /globe. */
export default function GlobePage() {
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { openAuth } = useAuthModal();

  // Picking a location (click or search) opens the dashboard; the globe shifts to make room.
  const select = useCallback((selection: MapSelection) => {
    setSelected(selection);
    setPanelOpen(true);
  }, []);

  // "Back" in the dashboard: forget the location (marker disappears) but keep the panel open.
  const clearSelection = useCallback(() => setSelected(null), []);

  // Clicked and random points have no name; fill it in once the backend has looked it up.
  const namePlace = useCallback((location: MapSelection, name: string) => {
    setSelected((current) =>
      current && current.lat === location.lat && current.lng === location.lng && !current.name ? { ...current, name } : current,
    );
  }, []);

  const selectSearchResult = useCallback(
    (r: GeocodeResult) => select({ lat: r.lat, lng: r.lng, name: r.name, source: 'search' }),
    [select],
  );

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#05060f]">
      {/* The VANTAGE wordmark lives in the top bar; the search bar sits directly below it (SPEC 2.6). */}
      <TopBar />

      <div className="relative min-h-0 flex-1">
        <Globe selected={selected} panelOpen={panelOpen} onSelect={select} />

        <div className="absolute left-4 top-4 z-10 w-80 max-w-[calc(100%-2rem)] sm:left-7">
          <Search onSelect={selectSearchResult} />
        </div>

        <LocationPanel
          location={selected}
          open={panelOpen}
          onOpen={() => setPanelOpen(true)}
          onClose={() => setPanelOpen(false)}
          onClear={clearSelection}
          onSelect={select}
          onRequestLogin={() => openAuth('login')}
          onPlaceName={namePlace}
        />
      </div>
    </div>
  );
}
