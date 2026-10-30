import type { ReactNode } from 'react';
import type { MapSelection } from '../../types';
import { PANEL_TRANSITION_MS, PANEL_WIDTH } from './layout';

interface LocationPanelProps {
  location: MapSelection | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Module cards (weather, sky, hazards…) go here. */
  children?: ReactNode;
}

function formatCoords(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lng).toFixed(3)}° ${ew}`;
}

/**
 * Dashboard shell. Right-hand side panel on desktop, bottom sheet on mobile.
 * Always mounted and slid off-screen when collapsed, so the transition runs both ways.
 */
export default function LocationPanel({ location, open, onOpen, onClose, children }: LocationPanelProps) {
  return (
    <>
      <aside
        id="location-panel"
        aria-label="Location dashboard"
        inert={!open}
        style={
          {
            '--panel-width': `${PANEL_WIDTH}px`,
            transitionDuration: `${PANEL_TRANSITION_MS}ms`,
          } as React.CSSProperties
        }
        className={[
          'fixed z-20 flex flex-col border-white/10 bg-slate-950/85 text-slate-100 shadow-2xl backdrop-blur-md',
          'transition-transform ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
          // desktop: full-height panel on the right
          'md:inset-y-0 md:right-0 md:w-(--panel-width) md:border-l',
          // mobile: bottom sheet
          'max-md:inset-x-0 max-md:bottom-0 max-md:h-1/2 max-md:rounded-t-2xl max-md:border-t',
          open ? 'translate-x-0 translate-y-0' : 'md:translate-x-full max-md:translate-y-full',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-base font-semibold">{location?.name ?? 'Dropped pin'}</h2>
            {location && <p className="m-0 mt-0.5 text-xs text-slate-400">{formatCoords(location.lat, location.lng)}</p>}
          </div>
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
          {children ?? <p className="m-0 text-sm text-slate-400">Weather, sky, and hazard modules for this location will appear here.</p>}
        </div>
      </aside>

      {/* Reopen handle: only while a location is picked but the dashboard is collapsed. */}
      {location && !open && (
        <button
          type="button"
          onClick={onOpen}
          aria-controls="location-panel"
          className="fixed right-4 top-4 z-10 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900/80"
        >
          Open dashboard
        </button>
      )}
    </>
  );
}
