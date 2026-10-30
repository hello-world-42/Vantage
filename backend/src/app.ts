import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { favoritesRouter } from "./routes/favorites.js";

/**
 * Builds the Express app without starting a server.
 * server.ts calls listen(); tests can import this directly.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL ?? "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "vantage-backend", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/favorites", favoritesRouter);

  // Routes (location, geocode, profile, ...) get mounted here as they're built.

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
