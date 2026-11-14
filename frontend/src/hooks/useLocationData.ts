import { useEffect, useState } from 'react';
import type { LocationResponse } from '@vantage/shared';
import { getLocation } from '../api/client';
import type { MapSelection } from '../types';

export type LocationDataState =
  | { status: 'loading' }
  | { status: 'ready'; data: LocationResponse }
  | { status: 'error' };

/** Fetches every dashboard module for the selected point from GET /api/location. */
export function useLocationData(location: MapSelection): LocationDataState & { reload: () => void } {
  const { lat, lng } = location;
  const key = `${lat},${lng}`;
  const [loaded, setLoaded] = useState<{ key: string; state: LocationDataState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ key, state: { status: 'loading' } });
    getLocation(lat, lng, controller.signal)
      .then((data) => setLoaded({ key, state: { status: 'ready', data } }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, state: { status: 'error' } });
      });
    return () => controller.abort();
  }, [key, lat, lng, attempt]);

  // Until the effect runs for a new point, never show the previous point's data.
  const state: LocationDataState = loaded && loaded.key === key ? loaded.state : { status: 'loading' };
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
