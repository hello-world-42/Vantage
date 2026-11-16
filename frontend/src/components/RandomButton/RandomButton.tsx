import { useEffect, useRef, useState } from 'react';
import { getRandomLocation } from '../../api/client';
import type { MapSelection } from '../../types';

interface RandomButtonProps {
  onSelect: (selection: MapSelection) => void;
}

/** Asks the backend for a random (land-biased) spot and sends the globe there. */
export default function RandomButton({ onSelect }: RandomButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Cancel a pending request if the button unmounts (e.g. the user picked a place meanwhile).
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleClick() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const spot = await getRandomLocation(controller.signal);
      if (!Number.isFinite(spot?.lat) || !Number.isFinite(spot?.lng)) throw new Error('Invalid location');
      onSelect({ lat: spot.lat, lng: spot.lng, name: spot.name, source: 'random' });
    } catch {
      if (controller.signal.aborted) return;
      setError('Random location is unavailable right now. Try again in a moment.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
          <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
          <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
          <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
        </svg>
        {loading ? 'Finding a spot…' : 'Random location'}
      </button>
      {error && (
        <p role="alert" className="m-0 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
