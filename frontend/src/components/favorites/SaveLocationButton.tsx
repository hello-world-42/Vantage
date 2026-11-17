import { useEffect, useState } from 'react';
import { ApiError, createFavorite, deleteFavorite, getFavorites } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

interface SaveLocationButtonProps {
  lat: number;
  lng: number;
  /** What the saved location will be called. */
  label: string;
  city?: string | null;
  country?: string | null;
  /** Opens the login modal for guests. */
  onRequestLogin?: () => void;
}

type State = { status: 'checking' } | { status: 'unsaved' } | { status: 'saved'; id: number } | { status: 'busy' };

const samePoint = (a: number, b: number) => Math.abs(a - b) < 1e-4;

/** Star button on a selected location: saves it to (or removes it from) the user's Saved Locations. */
export default function SaveLocationButton({ lat, lng, label, city, country, onRequestLogin }: SaveLocationButtonProps) {
  const { token, logout } = useAuth();
  const [state, setState] = useState<State>({ status: 'checking' });
  const [error, setError] = useState<string | null>(null);

  // Find out whether this exact point is already saved.
  useEffect(() => {
    if (!token) {
      setState({ status: 'unsaved' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'checking' });
    getFavorites(token, controller.signal)
      .then((favorites) => {
        const match = favorites.find((f) => samePoint(f.latitude, lat) && samePoint(f.longitude, lng));
        setState(match ? { status: 'saved', id: match.id } : { status: 'unsaved' });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        setState({ status: 'unsaved' });
      });
    return () => controller.abort();
  }, [token, lat, lng, logout]);

  async function toggle() {
    setError(null);
    if (!token) {
      onRequestLogin?.();
      return;
    }
    const before = state;
    if (before.status !== 'saved' && before.status !== 'unsaved') return;
    setState({ status: 'busy' });
    try {
      if (before.status === 'saved') {
        await deleteFavorite(token, before.id);
        setState({ status: 'unsaved' });
      } else {
        const favorite = await createFavorite(token, { label: label.slice(0, 255), latitude: lat, longitude: lng, city, country });
        setState({ status: 'saved', id: favorite.id });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        setState({ status: 'unsaved' });
        setError('Your session ended. Log in again to save places.');
      } else {
        setState(before);
        setError(before.status === 'saved' ? "Couldn't remove this place. Try again." : "Couldn't save this place. Try again.");
      }
    }
  }

  const saved = state.status === 'saved';
  const disabled = state.status === 'busy' || state.status === 'checking';
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={saved}
        className={[
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
          saved ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100 hover:bg-yellow-300/20' : 'border-white/15 text-slate-100 hover:bg-white/10',
        ].join(' ')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
        {saved ? 'Saved' : token ? 'Save this place' : 'Log in to save this place'}
      </button>
      {error && (
        <p role="alert" className="m-0 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
