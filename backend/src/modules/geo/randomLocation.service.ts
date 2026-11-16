import { isLand } from "./landMask.js";

export interface RandomLocation { lat: number; lng: number; name?: string }
export interface RandomLocationOptions {
  /** Injectable uniform random source in [0, 1) for deterministic tests. */
  random?: () => number;
  maxAttempts?: number;
}
export class RandomLocationError extends Error {
  constructor(message: string) { super(message); this.name = "RandomLocationError"; }
}

/**
 * Sample equal-area points on a sphere and accept points inside the offline land mask.
 * Work is bounded; never return a known ocean point as an exhaustion fallback.
 * No API keys, environment reads, geocoding, or network calls.
 */
export function getRandomLocation(options: RandomLocationOptions = {}): RandomLocation {
  const random = options.random ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 128;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) {
    throw new RandomLocationError("Random location attempt limit must be between 1 and 1000.");
  }
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RandomLocationError("Invalid random source.");
    return value;
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const lat = Math.asin(2 * draw() - 1) * 180 / Math.PI;
    const lng = draw() * 360 - 180;
    if (isLand(lat, lng)) return { lat, lng };
  }
  throw new RandomLocationError("Could not select a land location within the attempt limit.");
}
