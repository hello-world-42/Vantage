// The frontend ONLY talks to our own backend (keys stay server-side).
import type { GeocodeResponse, GeocodeResult, LocationResponse } from '@vantage/shared';
import type { AuthResponse, AuthUser, Favorite, RandomLocation } from '../types';

export class ApiError extends Error {
  status: number;
  /** Field-level messages from 400 responses, e.g. { password: ["..."] } (see zod `flatten().fieldErrors`). */
  details?: Record<string, string[]>;
  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** JWT for protected routes, sent as `Authorization: Bearer`. */
  token?: string | null;
  method?: 'GET' | 'POST' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
}

function readDetails(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(messages)) out[key] = messages.filter((m): m is string => typeof m === 'string');
  }
  return Object.keys(out).length ? out : undefined;
}

async function request<T>(path: string, { signal, token, method, body }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    // Backend errors look like { error: "message", details?: { field: [..] } }.
    let message = `Request failed (${res.status})`;
    let details: Record<string, string[]> | undefined;
    try {
      const parsed = (await res.json()) as { error?: unknown; details?: unknown };
      if (typeof parsed.error === 'string') message = parsed.error;
      details = readDetails(parsed.details);
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(res.status, message, details);
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

/** POST /api/auth/login -> { token, user }. 401 = wrong email or password. */
export function login(email: string, password: string, signal?: AbortSignal): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password }, signal });
}

/**
 * POST /api/auth/register -> { user } (201). The backend does NOT return a token here, so
 * callers that want the user signed in must call `login` afterwards. 409 = email already used.
 */
export function register(username: string, email: string, password: string, signal?: AbortSignal): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: { username, email, password }, signal });
}
