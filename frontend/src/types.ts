/** A point the user picked: clicked on the globe, chosen from search, picked at random, or a saved favorite. */
export interface MapSelection {
  lat: number;
  lng: number;
  /** Present for search/saved results; clicked and random points get one from /api/location's `place` when it's known. */
  name?: string;
  source: 'click' | 'search' | 'random' | 'saved';
}

/** The user object returned by POST /api/auth/login (see `sanitizedUser` in backend/src/routes/auth.ts). */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

/** The account returned by GET/PUT /api/profile. */
export interface Profile extends AuthUser {
  /** Which ways this account can sign in. Google-only accounts have no password to change. */
  signIn: { password: boolean; google: boolean };
}

/** One saved location from GET /api/favorites. */
export interface Favorite {
  id: number;
  label: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  savedAt: string;
}

/**
 * Response the frontend expects from GET /api/random (route not built yet; owner: Mohammed).
 * See SPEC.md Section 7.
 */
export interface RandomLocation {
  lat: number;
  lng: number;
  name?: string;
}

/** Body of a successful POST /api/auth/login (and of the Google redirect once the backend sends it). */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}
