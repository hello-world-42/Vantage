// The frontend ONLY talks to our own backend (keys stay server-side).
import type { GeocodeResponse, GeocodeResult } from '@vantage/shared';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, ...init });
  if (!res.ok) throw new ApiError(res.status, `Request to ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const data = await request<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  return data.results;
}
