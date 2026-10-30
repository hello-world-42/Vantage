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

export interface AppOptions {
  /** Inject a fake aggregator in tests; production builds the real one from env. */
  aggregateLocation?: AggregateLocation;
}

/**
 * Builds the Express app without starting a server.
 * server.ts calls listen(); tests can import this directly.
 */
export function createApp(options: AppOptions = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "vantage-backend", time: new Date().toISOString() });
  });

  const aggregateLocation =
    options.aggregateLocation ??
    createAggregator({
      modules: createModuleRegistry({ nwsUserAgent: env.NWS_USER_AGENT }),
      cache: createMemoryCache(), // CACHE_DRIVER=redis gets wired in when redisCache.ts exists
    });

  app.use("/api", createLocationRouter(aggregateLocation));
  app.use("/api/auth", authRouter);
  app.use("/api/favorites", favoritesRouter);
  // Other routers (geocode, profile, random, ...) get mounted here as they're built.

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}