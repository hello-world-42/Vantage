/** A point the user picked: clicked on the globe, chosen from search, picked at random, or a saved favorite. */
export interface MapSelection {
  lat: number;
  lng: number;
  /** Present for search/saved/random results; clicked points have no name until reverse geocoding exists. */
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
