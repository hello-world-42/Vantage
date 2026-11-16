// The frontend ONLY talks to our own backend (keys stay server-side).
import type { GeocodeResponse, GeocodeResult, LocationResponse } from '@vantage/shared';
import type { Favorite, RandomLocation } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** JWT for protected routes, sent as `Authorization: Bearer`. */
  token?: string | null;
  method?: 'GET' | 'DELETE';
}

async function request<T>(path: string, { signal, token, method }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { method, headers, signal });
  if (!res.ok) {
    // Backend errors look like { error: "message" }; fall back to a generic message.
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const data = await request<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  return data.results;
}

/** All dashboard modules for a point (backend snaps it to a grid cell and caches). */
export function getLocation(lat: number, lng: number, signal?: AbortSignal): Promise<LocationResponse> {
  return request<LocationResponse>(`/api/location?lat=${lat}&lng=${lng}`, { signal });
}

export function getRandomLocation(signal?: AbortSignal): Promise<RandomLocation> {
  return request<RandomLocation>('/api/random', { signal });
}

export async function getFavorites(token: string, signal?: AbortSignal): Promise<Favorite[]> {
  const data = await request<{ favorites: Favorite[] }>('/api/favorites', { token, signal });
  return data.favorites;
}

export function deleteFavorite(token: string, id: number): Promise<void> {
  return request<void>(`/api/favorites/${id}`, { token, method: 'DELETE' });
}
