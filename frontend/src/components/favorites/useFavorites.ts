import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteFavorite, getFavorites } from '../../api/client';
import type { Favorite } from '../../types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Loads the signed-in user's saved locations and supports removing one.
 * `onUnauthorized` runs when the API says the token is no longer valid (should log the user out).
 */
export function useFavorites(token: string | null, onUnauthorized: () => void) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<ReadonlySet<number>>(new Set());
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setFavorites([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    getFavorites(token, controller.signal)
      .then((list) => {
        setFavorites(list);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setStatus('error');
      });
    return () => controller.abort();
  }, [token, attempt, onUnauthorized]);

  const remove = useCallback(
    async (id: number) => {
      if (!token) return;
      setRemoveError(null);
      setRemoving((prev) => new Set(prev).add(id));
      try {
        await deleteFavorite(token, id);
        setFavorites((prev) => prev.filter((f) => f.id !== id));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else if (err instanceof ApiError && err.status === 404) setFavorites((prev) => prev.filter((f) => f.id !== id)); // already gone
        else setRemoveError("Couldn't remove that location. Try again.");
      } finally {
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [token, onUnauthorized],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { favorites, status, removing, removeError, reload, remove };
}
