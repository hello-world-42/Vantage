// Per-IP request limits, so one client (or a runaway script) can't exhaust our upstream
// API quotas or hammer the login form.
//
// - apiLimiter:  every /api request. Generous: clicking around the globe quickly is fine.
// - authLimiter: POST /api/auth/login and /register. Only failed attempts count, so a user
//                who logs in successfully is never locked out by it.
//
// Limits are per server process (in memory). Behind a hosting proxy, set TRUST_PROXY in .env
// (usually 1) so the real client IP is used instead of the proxy's.
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

export interface RateLimitSettings {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export const DEFAULT_API_LIMIT: RateLimitSettings = { limit: 300, windowMs: 5 * 60_000 };
export const DEFAULT_AUTH_LIMIT: RateLimitSettings = { limit: 10, windowMs: 15 * 60_000 };

function minutes(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  return m === 1 ? "1 minute" : `${m} minutes`;
}

function limiter(settings: RateLimitSettings, message: string, skipSuccessfulRequests: boolean): RequestHandler {
  return rateLimit({
    windowMs: settings.windowMs,
    limit: settings.limit,
    // Sends RateLimit and RateLimit-Policy headers (IETF draft 8) and Retry-After on 429.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    // Same JSON shape as every other error ({ error }), which the frontend already handles.
    handler: (_req, res) => {
      res.status(429).json({ error: `${message} Try again in ${minutes(settings.windowMs)}.` });
    },
  });
}

export function createApiLimiter(settings: RateLimitSettings = DEFAULT_API_LIMIT): RequestHandler {
  return limiter(settings, "Too many requests.", false);
}

export function createAuthLimiter(settings: RateLimitSettings = DEFAULT_AUTH_LIMIT): RequestHandler {
  return limiter(settings, "Too many sign-in attempts.", true);
}
