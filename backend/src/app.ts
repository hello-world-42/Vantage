import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { createMemoryCache } from "./cache/memoryCache.js";
import { createModuleRegistry } from "./aggregator/moduleRegistry.js";
import { createAggregator, type AggregateLocation } from "./aggregator/aggregateLocation.js";
import { createLocationRouter } from "./routes/location.js";
import { authRouter } from "./routes/auth.js";
import { favoritesRouter } from "./routes/favorites.js";
import { createGeocodeRouter } from "./routes/geocode.js";
import { createRandomRouter } from "./routes/random.js";
import { createErrorHandler, type ErrorHandlerOptions } from "./middleware/errorHandler.js";
import { createApiLimiter, createAuthLimiter, type RateLimitSettings } from "./middleware/rateLimit.js";
import { createCountryResolver } from "./modules/geo/geo.service.js";
import { cachedCountryResolver } from "./aggregator/countryCache.js";

export interface AppOptions {
  /** Inject a fake aggregator in tests; production builds the real one from env. */
  aggregateLocation?: AggregateLocation;
  /** Override where unexpected errors are logged (tests silence it). */
  logError?: ErrorHandlerOptions["logError"];
  /** Override or turn off (false) the per-IP limits; tests use small limits. */
  rateLimits?: { api?: RateLimitSettings | false; auth?: RateLimitSettings | false };
}

/**
 * Builds the Express app without starting a server.
 * server.ts calls listen(); tests can import this directly.
 */
export function createApp(options: AppOptions = {}) {
  const app = express();
  // Behind a hosting proxy, req.ip must come from X-Forwarded-For or every user shares one rate limit.
  if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "vantage-backend", time: new Date().toISOString() });
  });

  // Limits run after /api/health (uptime checks never count) and before body parsing,
  // so requests with broken bodies still count against the sign-in limit.
  const limits = options.rateLimits ?? {};
  if (limits.api !== false) app.use("/api", createApiLimiter(limits.api));
  if (limits.auth !== false) app.post(["/api/auth/login", "/api/auth/register"], createAuthLimiter(limits.auth));

  app.use(express.json());

  const cache = createMemoryCache(); // CACHE_DRIVER=redis gets wired in when redisCache.ts exists
  // Global lists (launches) get their own small cache so per-cell entries never evict them.
  const listCache = createMemoryCache({ maxEntries: 50 });
  const aggregateLocation =
    options.aggregateLocation ??
    createAggregator({
      modules: createModuleRegistry({
        nwsUserAgent: env.NWS_USER_AGENT,
        n2yoApiKey: env.N2YO_API_KEY,
        staticDataDir: env.STATIC_DATA_DIR,
        listCache,
        logError: options.logError,
      }),
      cache,
      // Country for NWS (US-only), from Mohammed's Mapbox reverse geocoding; cached per grid cell.
      // Without MAPBOX_TOKEN the country stays unknown unless the request passes ?country=.
      resolveCountry: env.MAPBOX_TOKEN ? cachedCountryResolver(createCountryResolver(env.MAPBOX_TOKEN), cache) : undefined,
      logError: options.logError,
    });

  app.use("/api", createLocationRouter(aggregateLocation));
  app.use("/api/auth", authRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/geocode", createGeocodeRouter({ getAccessToken: () => env.MAPBOX_TOKEN }));
  app.use("/api/random", createRandomRouter());
  // Other routers (profile, ...) get mounted here as they're built.

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Must stay last: turns errors from any route into JSON without stack traces.
  app.use(createErrorHandler({ logError: options.logError }));

  return app;
}
