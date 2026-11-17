import type { CSSProperties } from 'react';
import type { MapSelection } from '../../types';
import DefaultState from './DefaultState';
import LocationDetails from './LocationDetails';
import { PANEL_MARGIN, PANEL_TRANSITION_MS, PANEL_WIDTH } from './layout';

interface LocationPanelProps {
  /** The selected point, or null for the default state (Random + Saved Locations). */
  location: MapSelection | null;
  open: boolean;
  onOpen: () => void;
  /** Collapse the panel (the globe re-centers). */
  onClose: () => void;
  /** Deselect the location and go back to the default state. */
  onClear: () => void;
  /** Pick a location from inside the panel (Random button, Saved Locations). */
  onSelect: (selection: MapSelection) => void;
  /** Opens the login modal, when it exists. */
  onRequestLogin?: () => void;
  /** The backend named the selected point (reverse geocoding). */
  onPlaceName?: (location: MapSelection, name: string) => void;
}

function formatCoords(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lng).toFixed(3)}° ${ew}`;
}

/**
 * Dashboard shell. Desktop: a rounded card floating inside the map area (Figma screens 03, 06).
 * Mobile: a bottom sheet. Always mounted and slid off-screen when collapsed, so the transition
 * runs both ways; while collapsed, a small tab brings it back (screen 02).
 */
export default function LocationPanel({ location, open, onOpen, onClose, onClear, onSelect, onRequestLogin, onPlaceName }: LocationPanelProps) {
  const geometry = {
    '--panel-width': `${PANEL_WIDTH}px`,
    '--panel-margin': `${PANEL_MARGIN}px`,
  } as CSSProperties;

  return (
    <>
      <aside
        id="location-panel"
        aria-label="Location dashboard"
        inert={!open}
        style={{ ...geometry, transitionDuration: `${PANEL_TRANSITION_MS}ms` }}
        className={[
          'absolute z-20 flex flex-col overflow-hidden border-white/10 bg-slate-950/85 text-slate-100 shadow-2xl backdrop-blur-md',
          'transition-transform ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
          // desktop: floating rounded card, inset from the top, right and bottom edges
          'md:top-(--panel-margin) md:right-(--panel-margin) md:bottom-(--panel-margin) md:w-(--panel-width) md:rounded-2xl md:border',
          // mobile: bottom sheet
          'max-md:inset-x-0 max-md:bottom-0 max-md:h-1/2 max-md:rounded-t-2xl max-md:border-t',
          open ? 'translate-x-0 translate-y-0' : 'md:translate-x-[calc(100%+var(--panel-margin))] max-md:translate-y-full',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          {location ? (
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                onClick={onClear}
                aria-label="Back to dashboard home"
                className="-ml-2 grid size-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <div className="min-w-0">
                <h2 className="m-0 truncate text-base font-semibold">{location.name ?? 'Dropped pin'}</h2>
                <p className="m-0 mt-0.5 text-xs text-slate-400">{formatCoords(location.lat, location.lng)}</p>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <h2 className="m-0 text-base font-semibold">Explore</h2>
              <p className="m-0 mt-0.5 text-xs text-slate-400">Pick a spot to see live conditions</p>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Collapse dashboard"
            aria-controls="location-panel"
            className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {location ? (
            // keyed so a new point starts fresh instead of briefly showing the old one
            <LocationDetails key={`${location.lat},${location.lng}`} location={location} onRequestLogin={onRequestLogin} onPlaceName={onPlaceName} />
          ) : (
            <DefaultState onSelect={onSelect} onRequestLogin={onRequestLogin} />
          )}
        </div>
      </aside>

      {/* Collapsed tab (Figma screen 02): a tall pill on the right edge with ◀. On mobile it's a
          short pill at the bottom with ▲, since the sheet slides up from there. */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open dashboard"
          aria-controls="location-panel"
          aria-expanded={false}
          style={geometry}
          className={[
            'absolute z-10 grid place-items-center rounded-full border border-white/10 bg-[#2f3033]/90 text-slate-300 shadow-lg backdrop-blur',
            'transition-colors duration-100 hover:bg-[#3a3b3f] hover:text-white active:bg-[#232427] active:text-slate-400',
            'md:right-(--panel-margin) md:top-1/2 md:h-72 md:max-h-[60%] md:w-8 md:-translate-y-1/2',
            'max-md:bottom-3 max-md:left-1/2 max-md:h-8 max-md:w-32 max-md:-translate-x-1/2',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="max-md:rotate-90">
            <path d="M17 4 6 12l11 8z" fill="currentColor" />
          </svg>
        </button>
      )}
    </>
  );
}
