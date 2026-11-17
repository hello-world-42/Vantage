import { useId } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { MapSelection } from '../../types';
import { useFavorites } from './useFavorites';

interface SavedLocationsProps {
  onSelect: (selection: MapSelection) => void;
  /** Opens the login modal. When omitted (modal not built yet) the guest prompt has no button. */
  onRequestLogin?: () => void;
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-sm text-slate-400">{children}</p>;
}

/** Saved Locations section of the dashboard's default state. */
export default function SavedLocations({ onSelect, onRequestLogin }: SavedLocationsProps) {
  const headingId = useId();
  const { token, logout } = useAuth();
  const { favorites, status, removing, removeError, reload, remove } = useFavorites(token, logout);

  let content: React.ReactNode;
  if (!token) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <Message>Log in to save places and find them here later.</Message>
        {onRequestLogin && (
          <button
            type="button"
            onClick={onRequestLogin}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
          >
            Log in
          </button>
        )}
      </div>
    );
  } else if (status === 'idle' || status === 'loading') {
    content = (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading saved locations</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 rounded-lg bg-white/10 animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    );
  } else if (status === 'error') {
    content = (
      <div className="flex flex-col items-start gap-2">
        <Message>Couldn&rsquo;t load your saved locations.</Message>
        <button
          type="button"
          onClick={reload}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    );
  } else if (favorites.length === 0) {
    content = <Message>You haven&rsquo;t saved any locations yet.</Message>;
  } else {
    content = (
      <>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {favorites.map((f) => {
            const detail = [f.city, f.country].filter(Boolean).join(', ');
            return (
              <li key={f.id} className="flex items-center gap-1 rounded-lg hover:bg-white/5">
                <button
                  type="button"
                  onClick={() => onSelect({ lat: f.latitude, lng: f.longitude, name: f.label, source: 'saved' })}
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left"
                >
                  <span className="block truncate text-sm text-slate-100">{f.label}</span>
                  {detail && <span className="block truncate text-xs text-slate-400">{detail}</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${f.label} from saved locations`}
                  disabled={removing.has(f.id)}
                  onClick={() => remove(f.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/10 hover:text-red-300 disabled:opacity-40"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
        {removeError && (
          <p role="alert" className="m-0 mt-2 text-xs text-red-300">
            {removeError}
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="m-0 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Saved locations
      </h3>
      {content}
    </section>
  );
}
