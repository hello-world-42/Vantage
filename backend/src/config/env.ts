// Loads the root .env once, validates it, and exports a typed `env` object.
// The rest of the backend imports `env` and never reads process.env directly.
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// One .env at the repo root, shared with the frontend. Works from src/ (dev) and dist/ (build).
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url))});

/** Blank lines like `N2YO_API_KEY=` arrive as "", so treat them as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_URL: z.url().default("http://localhost:5173"),
  /** Proxies in front of the app (hosting load balancer). 0 locally, usually 1 when deployed. Rate limits use it to find the client IP. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

  // Database and auth (required once those features land)
  DATABASE_URL: optional(z.string()),
  JWT_SECRET: optional(z.string().min(32, "JWT_SECRET should be at least 32 characters")),
  JWT_EXPIRES_IN: z.string().default("7d"),
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  GOOGLE_CALLBACK_URL: optional(z.url()),

  // Data sources. A missing key disables only the module that needs it.
  MAPBOX_TOKEN: optional(z.string()),
  NASA_FIRMS_MAP_KEY: optional(z.string()),
  FIRMS_SOURCE: z.string().default("VIIRS_NOAA20_NRT"),
  N2YO_API_KEY: optional(z.string()),
  OPENAQ_API_KEY: optional(z.string()),
  ASTRONOMY_API_ID: optional(z.string()),
  ASTRONOMY_API_SECRET: optional(z.string()),
  /** NWS requires a User-Agent that identifies the app and a contact, e.g. "Vantage (team@example.com)" */
  NWS_USER_AGENT: optional(z.string()),

  /** Folder with preprocessed grids (light pollution, population). Defaults to data/static at the repo root. */
  STATIC_DATA_DIR: optional(z.string()),

  // Cache
  CACHE_DRIVER: z.enum(["memory", "redis"]).default("memory"),
  UPSTASH_REDIS_REST_URL: optional(z.url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("\n✖ Invalid environment configuration (check the .env at the repo root):");
    for (const issue of parsed.error.issues) {
      console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("  See .env.example for the expected variables.\n");
    process.exit(1);
  }
  // The auth and database code reads a few values straight from process.env. Copy this
  // file's defaults there, so a .env that leaves them out behaves the same everywhere
  // (without this, a missing JWT_EXPIRES_IN made every login fail with a 500).
  process.env.JWT_EXPIRES_IN ??= parsed.data.JWT_EXPIRES_IN;
  process.env.NODE_ENV ??= parsed.data.NODE_ENV;
  return parsed.data;
}

export const env: Env = loadEnv();
