# VANTAGE: PROJECT SPEC

> **What this file is for.** This is the single source of truth for the Vantage project. Every teammate, and every coding agent working for a teammate, reads this file **before** making changes and updates it **after**. It says what we're building, how the code is organized, what's done, what's in progress, and **who owns which files right now**, so two people never edit the same file at the same time.

Last updated: 2026-11-15 by Lance Santiago (LanceSan04)

---

## 1. Rules (read first, every time)

1. **Read this file before every change.** Check Section 5 (In Progress) to see who owns which files.
2. **Don't edit files someone else has claimed** in Section 5. If you need a change in a claimed file, ask the owner in the team chat, or open an issue and tag them.
3. **Claim before you start.** Before touching a file, add yourself to Section 5 with the exact file paths, your branch name and the date. Push that SPEC change (or tell the team) so others see the claim.
4. **Update this file when you finish.** Move your item from Section 5 to Section 6 (Completed), list the files you changed, and add a line to the Change Log (Section 9) with **your name, your GitHub username, the date, and whether a coding agent helped**.
5. **Agents must identify who they're working for.** An agent editing this file writes the teammate's name, not its own, as the owner, and notes "(agent-assisted)" in the Change Log.
6. **Never commit secrets.** The real `.env` lives at the repo root and is git-ignored. Only `.env.example` (blank values) is committed. If a key is ever pushed, tell the team and regenerate it.
7. **Branch from `dev`, PR into `dev`.** Name branches `feature/<short-name>`. Don't push straight to `main`. `main` only gets working, demo-ready code from `dev`.
8. **Respect the architecture** (Section 3). In particular: the frontend never calls third-party APIs directly, and every data module returns the shared `ModuleResult` format.
9. **Keep this file accurate.** If something here is wrong or out of date, fix it in the same PR and say so in the Change Log.

---

## 2. Project Basis

### 2.1 What Vantage is

A web app with a **3D interactive globe**. A user clicks a spot on the globe or searches for a place, and a **dashboard panel** shows live data for that location: weather, air quality, UV, astronomy, satellites, rocket launches, aurora, natural hazards, ocean conditions, light pollution and population. A **Random Location** button jumps to a random spot (biased toward land). Registered users can **save favorite locations**.

Team class project, Software Engineering, Georgia State University. The professor requires an ERD, use-case diagram, wireframes, testing scenarios and sprint reports.

### 2.2 Team

| Person | GitHub | Sprint role |
|---|---|---|
| Lance Santiago | LanceSan04 | Foundation and integration: repo setup, shared contract, aggregator, cache, PR reviews |
| Aamir Mohammad | amohammad12 | Database and auth |
| Mario Sepriano | hello-world-42 | Frontend: globe, dashboard, search UI, auth UI |
| Mohammed Hussain Shareef Shaik | (fill in) | Data modules: geocoding, weather, hazards, random location; testing scenarios |

### 2.3 User roles

**Guest < Registered User < Admin.** Each role inherits everything from the one before it.

- **Guest:** explore the globe, search, select a location, view the dashboard, use Random, register, log in (email/password or **Login with Google**).
- **Registered User:** save, view and delete favorite locations; manage profile (username, email, password; **no profile picture**); log out.
- **Admin:** manage users; enable/disable data sources. **Admin has no UI screens.** It's handled through the database/API only.

### 2.4 Requirements

**Functional:** credential system (JWT + Google OAuth), profile management, interactive 3D globe with clickable locations, location search (geocoding), random location button, location data dashboard, save/favorite locations, role-based access.

**Non-functional:**
- Fast loads through caching.
- Rate limiting so API quotas aren't exceeded.
- API keys stored server-side only.
- **The frontend only talks to our backend.** The backend makes every third-party call.
- Attribution shown in the UI (Open-Meteo requires it).

### 2.5 Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Mapbox GL JS 3, TypeScript |
| Backend | Node (≥ 20.19), Express 4, helmet, cors, dotenv, zod 4, TypeScript (run with `tsx`), `pg`, bcrypt, jsonwebtoken, google-auth-library, cookie-parser |
| Shared | `@vantage/shared` workspace package (types + zod schemas used by both sides) |
| Database | PostgreSQL on Neon |
| Auth | JWT + bcrypt, Google OAuth 2.0 (PKCE) |
| Cache | In-memory by default; optional Upstash Redis (`CACHE_DRIVER`) |
| Repo | npm workspaces monorepo: `shared`, `backend`, `frontend` |

### 2.6 Wireframes (Figma)

File: https://www.figma.com/design/1VNiWPD34n7ETR2w0CqR14 (7 screens on one page)

Screens: 01 Landing Page · 02 Globe Home (Guest) · 03 Dashboard Open (Guest) · 04 Search Dropdown · 05 Login / Register · 06 Dashboard Open (Registered) · 07 Profile.

**UI rules (apply everywhere):**
- Dashboard collapsed → globe **centered**. Dashboard open → globe **shifts left**.
- Search bar sits **directly below the VANTAGE logo**, top-left, on every globe screen.
- **Random button and Saved Locations live inside the dashboard**, not the top bar and not a separate page.
- Dashboard with no location selected shows a **default state** (Random button + Saved Locations).
- Search results each have a **☆ star** for favoriting.
- Login/Register is a modal with **Login with Google** at the top.
- Profile has no profile picture.
- Landing page: app description plus a link to the globe page.

---

## 3. Architecture

### 3.1 Request flow

```
Browser (React)
  └─ fetch("/api/...")            ← frontend only ever calls /api
      └─ Vite dev proxy → http://localhost:3000
          └─ Express (backend/src/app.ts)
              └─ route (backend/src/routes/*)
                  ├─ auth / favorites → Neon PostgreSQL (backend/src/db/)
                  └─ aggregator (backend/src/aggregator/)
                      ├─ cache check (backend/src/cache/)   ← grid-cell key + TTL
                      └─ data modules (backend/src/modules/*) → third-party APIs
```

### 3.2 Key design decisions (final)

- **ModuleResult envelope.** Every data module returns one shape with a `status` of `ok`, `not_applicable`, `error` or `disabled`. Defined in `shared/src/contract.ts`.
- **Aggregator** runs all modules in parallel with `Promise.allSettled`, so one failing API never breaks the dashboard.
- **Module registry** lists each module's `id`, `scope` (`cell` / `global` / `cell-and-country`; `us-only` is the old name for `cell-and-country`), `ttlSeconds` and `fetch` function. Modules are built by `create<Name>Module()` in `modules/<area>/<area>.service.ts` (weather's small wrapper lives in the registry).
- **Combined cards (sub-sources).** A card fed by several providers (hazards, space) uses `aggregator/subSources.ts`: the providers run in parallel and each gets its own `{ status, source, data | reason | message }` row inside the card, so one failing provider shows as "unavailable" in its row instead of failing the card. If every provider fails, the whole card is an `error`. A card with a failed row is cached for only 60 s so it retries soon (`ProviderOutcome.ttlSeconds`).
- **Country lookup.** The aggregator asks Mohammed's Mapbox reverse geocoder for the country of the cell center (needs `MAPBOX_TOKEN`), cached per cell for 30 days (`aggregator/countryCache.ts`). `?country=` on `/api/location` still overrides it.
- **Grid snapping.** Coordinates snap to a grid cell (start with 0.25°) and we fetch for the cell **center**. That makes nearby clicks share one cache entry.
- **Lazy (on-demand) caching, no background jobs.** Data is fetched the first time someone needs it, then cached until its TTL expires. Free hosting sleeps when idle, so scheduled jobs wouldn't run. The `jobs/` folder was removed on purpose; **don't re-add it.**
- **Singleflight.** Duplicate in-flight requests for the same key share one upstream call.
- **Timeouts.** Every upstream call has a ~5 s timeout and stops when the aggregator's `context.signal` aborts. New clients use `fetchJson` / `fetchText` from `lib/http.ts`; the existing NWS, USGS, Open-Meteo and Mapbox clients have their own equivalent timeouts. The aggregator separately caps each whole module at 8 s.
- **Errors.** `middleware/errorHandler.ts` is the last middleware: unexpected errors become `500 { error: "Something went wrong." }` and are logged server-side only (path, never the query string); safe 4xx errors (bad JSON body, too large) keep their status. Routes pass errors with `next(err)`.
- **Global-list sources** (Launch Library 2, GVP volcanoes) are cached under **one** key with `cache/globalList.ts`, in their own small cache (`listCache` in `app.ts`) so per-cell entries can't evict them, and filtered by distance in our code (`lib/geo.ts`). Never cache them per cell.
- **Provider quotas.** `lib/throttle.ts` gives low-quota providers a per-hour budget below their limit (Launch Library 10/h of 15, N2YO 90/h of 100). When it's used up, that provider's row shows unavailable until the window frees up. The budget is per server process.
- **Rate limits.** `middleware/rateLimit.ts`: 300 requests per 5 min per IP on `/api` (not `/api/health`), and 10 *failed* sign-in attempts per 15 min on `POST /api/auth/login` and `/register`. Both answer `429 { error }` with `Retry-After`. Deployed behind a proxy, set `TRUST_PROXY=1` or every user shares one limit.
- **Admin can disable providers** through the `data_sources` table. The aggregator checks it and returns `disabled` for those modules.
- **`app.ts` / `server.ts` split.** `app.ts` builds the Express app (testable without a port); `server.ts` loads env and calls `listen()`.
- **Auth tokens.** Email/password login and Google OAuth both return a JWT (`Authorization: Bearer`). Google OAuth uses PKCE plus short-lived signed HttpOnly cookies for `state` and the code verifier only.

### 3.3 Environment

- **One `.env` at the repo root**, shared by backend and frontend. Copy `.env.example` → `.env` and fill it in.
- The backend loads it in `backend/src/server.ts`; Vite reads it via `envDir` in `frontend/vite.config.ts`.
- Only variables starting with `VITE_` reach the browser. **Only `VITE_MAPBOX_TOKEN` (public) and `VITE_API_URL` belong there.**
- Backend port: **3000**. Frontend dev server: **5173**. The Vite proxy forwards `/api` → `localhost:3000`.
- `TRUST_PROXY` (default 0): number of proxies in front of the backend once deployed (usually 1). `STATIC_DATA_DIR` (optional, relative to the repo root): where the preprocessed grids live; defaults to `data/static`.
- Auth and the database need `DATABASE_URL`, `JWT_SECRET` (at least 32 characters), and `JWT_EXPIRES_IN`. Google login also needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. `env.ts` still treats those as optional at process start so the location aggregator can boot without them; the auth and DB code require them when those routes run.

### 3.4 Data sources

| Source | Data | Key? | Notes |
|---|---|---|---|
| Mapbox | Globe tiles + geocoding | Yes (`VITE_MAPBOX_TOKEN`, `MAPBOX_TOKEN`) | Geocoding goes through the backend only |
| Open-Meteo | Weather, UV, air quality, marine | No | Attribution required. Marine returns nothing inland → `not_applicable` |
| USGS | Earthquakes | No | |
| NWS | US severe weather alerts | No | **US-only** → `not_applicable` elsewhere. Needs `NWS_USER_AGENT` header |
| NOAA SWPC | Aurora | No | JSON feeds |
| NASA FIRMS | Wildfires | Yes (`NASA_FIRMS_MAP_KEY`) | Use `FIRMS_SOURCE=VIIRS_NOAA20_NRT`. **Suomi NPP ends Nov 2, 2026; don't use `VIIRS_SNPP_NRT`** |
| N2YO | Satellite passes | Yes (`N2YO_API_KEY`) | Low hourly quota; cache aggressively |
| Launch Library 2 | Rocket launches | No | Global list, very low free quota |
| Smithsonian GVP | Volcanoes | No | Global list (RSS/CAP) |
| OpenAQ | Air quality fallback | Yes (`OPENAQ_API_KEY`) | Optional |
| AstronomyAPI / suncalc | Sun/moon | Yes / No | Prefer `suncalc` (npm, no quota) |
| VIIRS (EOG) | Light pollution | Account only | **Offline** annual download → preprocess into `data/static/` |
| SEDAC | Population | Earthdata login | **Offline** download → preprocess into `data/static/` |

### 3.5 Database (Neon / PostgreSQL)

Three tables. Live API data is cached, never stored in the DB. Guests aren't stored. Apply migrations in order: `001_initial_schema.sql`, `002_seed_data_sources.sql`, `003_google_oauth.sql`.

- **users:** `user_id` PK, `username`, `email` (unique), `password_hash` (nullable after `003`), `google_sub` (unique, nullable), `role` ('user' | 'admin'), `created_at`. Check constraint: at least one of `password_hash` or `google_sub` is set.
- **favorite_locations:** `favorite_id` PK, `user_id` FK → users (cascade delete), `label`, `latitude`, `longitude`, `country`, `city`, `saved_at`
- **data_sources:** `source_id` PK, `updated_by` FK → users (nullable, set null), `name` (unique), `category`, `is_enabled`, `last_status`, `last_checked_at`

`002_seed_data_sources.sql` inserts six enabled rows (idempotent on `name`): Open-Meteo, USGS, NWS, NOAA SWPC, N2YO, Launch Library 2.

Relationships: users 1 → 0..* favorite_locations ("saves"); users 0..1 → 0..* data_sources ("updates").

Connection: `backend/src/db/client.ts` lazy-creates a `pg` pool from `DATABASE_URL`. Types live in `backend/src/db/schema.ts`.

### 3.6 API endpoints (planned)

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/health` | — | ✅ Done |
| GET | `/api/geocode?q=` | — | ✅ Implemented locally for KAN-21; mocked tests passed, PR/live check pending |
| GET | `/api/location?lat=&lng=[&country=]` | — | ✅ Done. Cards: weather (Open-Meteo), hazards (NWS + USGS), astronomy (suncalc), space (Launch Library 2 + N2YO), sky conditions (only once `data/static` grids exist). Data shapes: `shared/src/modules/*.ts` |
| GET | `/api/random` | — | ✅ KAN-24 implemented locally; offline land-biased selection, proxy HTTP 200 verified, commit/PR pending |
| POST | `/api/auth/register`, `/api/auth/login` | — | ✅ Done (bcrypt + JWT) |
| POST | `/api/auth/logout` | — | ❌ Not started |
| GET | `/api/auth/google`, `/api/auth/google/callback` | — | ✅ Done (PKCE; returns the same JWT shape as password login) |
| GET/PUT | `/api/profile` | User | ❌ Not started |
| GET/POST | `/api/favorites` | User | ✅ Done |
| DELETE | `/api/favorites/:favoriteId` | User | ✅ Done |
| * | `/api/admin/...` | Admin | ❌ Not started (no UI) |

---

## 4. Current Project Structure (`dev` branch)

Legend: ✅ has real code · ⬜ empty placeholder file · 📁 empty folder (`.gitkeep`)

```
Vantage/
├── SPEC.md                      ✅ this file
├── README.md                    ⬜
├── .env.example                 ✅ template for the root .env
├── .gitignore                   ✅ blocks .env, node_modules, dist
├── package.json                 ✅ workspaces + root scripts
├── package-lock.json            ✅
├── tsconfig.base.json           ✅ shared strict TS settings
│
├── shared/                      @vantage/shared
│   ├── package.json             ✅ exports ./src/contract.ts, ./schemas and ./modules/* ; depends on zod 4
│   ├── tsconfig.json            ✅
│   └── src/
│       ├── contract.ts          ✅ GeocodeResult, ModuleId, ModuleStatus, ModuleResult<T>, GridCell, LocationResponse
│       ├── modules/             ✅ each card's data shape, one file per module: weather, earthquakes (Mohammed); sources, hazards, astronomy, space, skyConditions (Lance). Import `@vantage/shared/modules/<name>`
│       └── schemas.ts           ✅ zod: locationQuerySchema, geocodeQuerySchema
│
├── backend/                     @vantage/backend
│   ├── package.json             ✅ express, helmet, cors, dotenv, zod 4, tsx, pg, bcrypt, jsonwebtoken, google-auth-library, cookie-parser, express-rate-limit, suncalc
│   ├── tsconfig.json            ✅ build · tsconfig.test.json ✅ typecheck incl. tests
│   ├── scripts/run-tests.mjs    ✅ finds and runs every backend test file (`npm test`)
│   ├── tests/                   ✅ node:test suites for every module, client, route and helper + fixtures/
│   └── src/
│       ├── app.ts               ✅ helmet, CORS, /api/health, rate limits, JSON, aggregator (+ country lookup) + /api/location, /api/auth, /api/favorites, /api/geocode, /api/random, 404, error handler
│       ├── server.ts            ✅ listen(env.PORT)
│       ├── config/env.ts        ✅ loads root .env, validates with zod, exports typed `env`
│       ├── aggregator/          ✅ moduleRegistry.ts (weather, hazards, astronomy, space, skyConditions), aggregateLocation.ts, subSources.ts, countryCache.ts
│       ├── auth/                ✅ googleOAuth.ts (+ tests)
│       ├── cache/               ✅ cache.ts, memoryCache.ts, ttlPolicy.ts, globalList.ts · ⬜ redisCache.ts
│       ├── lib/                 ✅ grid.ts, singleflight.ts, http.ts (fetchJson/fetchText with timeout), geo.ts (distance), throttle.ts (per-provider budget)
│       ├── middleware/          ✅ authenticate, requireRole (+ tests), errorHandler, rateLimit · ⬜ validate
│       ├── routes/              ✅ location.ts, auth.ts, favorites.ts (+ tests), geocode.ts + random.ts (local) · ⬜ admin, profile
│       ├── db/                  ✅ client.ts, schema.ts, migrations/001_initial_schema.sql, 002_seed_data_sources.sql, 003_google_oauth.sql (+ tests)
│       └── modules/
│           ├── geo/             ✅ forward/reverse clients, geo.service.ts, randomLocation.service.ts, landMask.ts + offline land data (local)
│           ├── weather/         ✅ openMeteo.client.ts, weather.service.ts (registered as the weather module)
│           ├── airQuality/      ⬜ airQuality.service.ts, openAq.client.ts, openMeteoAirQuality.client.ts
│           ├── astronomy/       ✅ astronomy.service.ts, suncalc.service.ts · ⬜ astronomyApi.client.ts (not needed so far)
│           ├── hazards/         ✅ hazards.service.ts (fetchEarthquakes + the combined card), nwsAlerts.client.ts, usgsQuakes.client.ts · ⬜ nasaFirms, gvpVolcano clients
│           ├── ocean/           ⬜ ocean.service.ts, openMeteoMarine.client.ts
│           ├── space/           ✅ space.service.ts, launchLibrary.client.ts, n2yo.client.ts · ⬜ noaaSwpc.client.ts
│           └── staticData/      ✅ staticData.service.ts (grid loader + skyConditions module)
│
├── frontend/                    @vantage/frontend
│   ├── package.json             ✅ react 19, vite 8, tailwind 4, mapbox-gl
│   ├── tsconfig.json            ✅
│   ├── vite.config.ts           ✅ envDir = repo root, /api proxy → :3000
│   ├── index.html               ✅
│   └── src/
│       ├── main.tsx, App.tsx, index.css, types.ts, vite-env.d.ts   ✅
│       ├── api/client.ts        ✅ geocode, getLocation, getRandomLocation, getFavorites, deleteFavorite
│       ├── components/
│       │   ├── Globe/Globe.tsx                  ✅
│       │   ├── Search/Search.tsx                ✅
│       │   ├── LocationPanel/   ✅ LocationPanel, DefaultState, LocationDetails, layout.ts
│       │   ├── Logo.tsx                         ✅
│       │   ├── Attribution.tsx                  ⬜
│       │   ├── modules/         ✅ ModuleCard · ⬜ Weather/AirQuality/Astronomy/Hazards/Ocean/SkyConditions/Space
│       │   ├── RandomButton/RandomButton.tsx    ✅
│       │   ├── favorites/       ✅ SavedLocations.tsx, useFavorites.ts
│       │   └── auth/, profile/, admin/   📁
│       ├── context/AuthContext.tsx   ✅ session holder only (no login UI yet)
│       └── hooks/               ✅ useAuth.ts, useLocationData.ts
│
├── scripts/preprocess-static/   📁 offline GDAL/Python for VIIRS + SEDAC
└── data/static/                 📁 generated coarse grids
```

### Branches

| Branch | Owner | State |
|---|---|---|
| `main` | — | Initial scaffold only. Update from `dev` at milestones |
| `dev` | everyone | Integration branch. All PRs go here. At `37e9abb`: database, auth, aggregator, NWS hazards, globe, geocoding client |
| `feature/database-setup` | Aamir | **Merged** into `dev` (PR #1) |
| `feature/auth` | Aamir | **Merged** into `dev` (PR #5) |
| `feature/nws-alerts-client` | Mohammed | **Merged** into `dev` (PR #4) |
| `feature/globe` | Mario | Merged into `dev` |
| `person4-geocode-weather` | Mohammed | Merged into `dev` |
| `feature/workspace-scaffold` | Lance | Merged into `dev` (PR #6) |

### Running it

```bash
npm install
cp .env.example .env      # then fill in the keys
npm run dev               # backend :3000 + frontend :5173
```

Other scripts: `npm run dev:backend`, `npm run dev:frontend`, `npm run build`, `npm run typecheck`, `npm test`. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests and build on every PR into `dev` or `main`; see `README.md` for full setup.

Backend tests (from the repo root; works the same on Windows):

```bash
npm test
```

Try the aggregator: `http://localhost:3000/api/location?lat=33.75&lng=-84.39&country=US` (needs `NWS_USER_AGENT` in `.env`).

Auth and favorites need `DATABASE_URL` and `JWT_SECRET`. Google login also needs the `GOOGLE_*` variables and a matching authorized redirect URI.

---

## 5. In Progress (claimed files: don't touch unless you're the owner)

> Format: **Owner** · branch · started · goal · exact files. Remove your entry when done and move it to Section 6.
> Entries marked *(from sprint plan, confirm)* were assigned in the sprint plan but the owner hasn't confirmed the claim yet. Owners: confirm or edit your entry.

### Lance Santiago (LanceSan04): integration
- **Branch:** `feature/workspace-scaffold` · **Started:** 2026-11-15
- **Goal:** wire `data_sources.is_enabled` into the aggregator with Aamir; review and merge PRs. (Foundation cleanup, the new cards and the weather/USGS/country wiring are done; see Section 6.)
- **Files:**
  - `backend/src/app.ts` (aggregator wiring only)
- **Shared integration points Lance maintains** (other owners may add their *own* entry, then tell Lance):
  - `shared/src/contract.ts`: add a new `ModuleId` when you add a module. Put your module's data type in your own file under `shared/src/modules/` (imported as `@vantage/shared/modules/<file>`; the package exports the whole folder) instead of editing the envelope types.
  - `backend/src/aggregator/moduleRegistry.ts`: add your module's entry to `createModuleRegistry()`. Don't change the aggregator itself.
  - `backend/src/cache/ttlPolicy.ts`: one line per module.

**How to add a data module** (the contract every module follows):
1. Write the client in `backend/src/modules/<area>/`. Call the API with `fetchJson` / `fetchText` from `lib/http.ts` (pass `context.signal` and a `service` name), validate the body with zod, then return `{ status: "ok", source, data }` or `{ status: "not_applicable", source?, reason }`, and **throw** on failure. Don't read `process.env`; take keys as arguments.
2. Wrap it in `create<Name>Module()` in `modules/<area>/<area>.service.ts`, returning `{ id, label, scope, ttlSeconds, fetch(context) }` (see `astronomy.service.ts` for the smallest example). Use `context.cell.lat/lng` (the cell center), not the raw click. Add one line for it in `createModuleRegistry()`.
3. Pass any key it needs from `env` in `app.ts` → `createModuleRegistry({...})`.
4. The aggregator handles caching, singleflight, timeouts (8 s), the disabled check and turning throws into `{ status: "error" }`.
5. A low-quota provider gets a `createThrottle(...)`; a worldwide list goes through `createGlobalList(...)` with `listCache`.

**How to add a hazard source** (FIRMS fires, GVP volcanoes): write the client in `modules/hazards/`, add one `SubSource` (`key`, `source`, `label`, `fetch`) to the `sources` array in `createHazardsModule()` (`hazards.service.ts`; `earthquakesSource()` is the example), and add the same key with its data type to `HazardsData` in `shared/src/modules/hazards.ts`. Return `not_applicable` when the source doesn't cover the spot and throw on failure; the card handles the rest. Space sources (NOAA SWPC aurora) work the same way in `space.service.ts` / `SpaceData`.

### Aamir Mohammad (amohammad12): profile API and data-source admin wiring
- **Branch:** start a new `feature/...` from `dev` (`feature/database-setup` and `feature/auth` are merged)
- **Goal:** profile routes next; then logout if the team wants a server endpoint; then wire `data_sources.is_enabled` into the aggregator with Lance.
- **Files:**
  - `backend/src/routes/profile.ts`
  - Next: `backend/src/routes/auth.ts` (logout only, if added), `backend/src/routes/admin.ts`
- **Do not edit** Lance's aggregator/cache/contract files without coordinating. The aggregator already accepts `isEnabled(id)`; wiring it to Neon is a joint step (see Section 7).

### Mario Sepriano: frontend dashboard
- **Branch:** `feature/dashboard` (started 2026-11-14)
- **Goal:** the dashboard contents are done (see Section 6). Next: the module-specific components, then the auth modal and landing page.
- **Files still claimed:**
  - `frontend/src/components/Globe/Globe.tsx`, `frontend/src/components/Search/Search.tsx`, `frontend/src/components/LocationPanel/*`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/types.ts`, `frontend/src/api/client.ts`
  - `frontend/src/components/modules/*`
  - Next: `frontend/src/components/auth/*`, `frontend/src/context/AuthContext.tsx`, `frontend/src/hooks/useAuth.ts`

---

## 6. Completed

### Lance: foundation cleanup, new cards and integration of Mohammed's providers, completed on 2026-11-15

- **Owner:** Lance Santiago (LanceSan04, agent-assisted).
- **Branch:** `feature/workspace-scaffold`.
- **Foundation:** JSON error handler (closes a stack-trace leak on 500s), `lib/http.ts`, root `npm test`, README, GitHub Actions CI (typecheck, tests, build on every PR into `dev`/`main`), rate limits, `tsconfig.test.json` so tests are type-checked.
- **New cards:** astronomy (suncalc: sun times, twilight, moon phase/rise/set; no key), space (Launch Library 2 upcoming launches with nearby pads within 1,000 km, plus N2YO visible passes for ISS, Tiangong and Hubble when `N2YO_API_KEY` is set), sky conditions (light pollution + population from preprocessed grids; registered only once the grid files exist).
- **Integration of Mohammed's work:** weather registered as a module; hazards is now one card combining NWS alerts and USGS earthquakes (earthquakes show worldwide, NWS only in the US); his country resolver is wired into the aggregator with a per-cell cache.
- **Helpers:** `aggregator/subSources.ts`, `aggregator/countryCache.ts`, `cache/globalList.ts`, `lib/geo.ts`, `lib/throttle.ts`.
- **Static data:** `scripts/preprocess-static/preprocess.py` regrids a VIIRS or SEDAC GeoTIFF into a 0.25° float32 grid in `data/static/` (row 0 = south, same indexing as `lib/grid.ts`). Tested end to end on a synthetic GeoTIFF; not yet run on the real downloads.
- **Checks:** 231 backend tests pass (61 new; `dev` had 170); typecheck and build clean; a clean `npm ci` copy passes the CI steps with no `.env`. Live: Atlanta, San Francisco, Tokyo and the mid-Atlantic all returned weather, hazards (NWS + USGS, or USGS only outside the US), astronomy and space; the launch list was fetched once and reused. An independent review found no high-severity issues; its six smaller findings were fixed. **Not verified:** N2YO live (no key in the sandbox), the country lookup with a real Mapbox token, the preprocessing on real rasters.

### KAN-24 random land-biased route verified locally on 2026-11-15

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/person4-data-modules`. All Person 4 work remains uncommitted; no push/PR/merge performed.
- **Files:** `backend/src/modules/geo/randomLocation.service.ts`, `backend/src/modules/geo/landMask.ts`, `backend/src/modules/geo/data/land.json`, `backend/src/modules/geo/data/README.md`, `backend/src/routes/random.ts`, `backend/src/app.ts` (random mount only), `backend/tests/randomLocation.service.test.ts`, `backend/tests/random.route.test.ts`.
- **Selection:** offline rejection sampling with uniform longitude and latitude sampled via inverse-sine for equal spherical area. Candidates must fall inside the Natural Earth land mask; holes/coast boundaries are excluded by the containment routine. Defaults to at most 128 attempts and throws on exhaustion, never returns a known ocean point as fallback. Injectable random source/attempt cap allow deterministic testing. No geocoding, API keys or network calls at runtime.
- **Data:** public-domain Natural Earth v5.1.2 1:110m land, 127 polygons/5,143 positions, properties removed and coordinates unchanged. Provenance, upstream SHA-256, license and limitations are recorded in the adjacent data README. This is a coarse land bias: small islands, inland waters and detailed coastlines may differ from the visible Mapbox map; it is not precise land/water verification. No runtime dependency or API account was added.
- **Route:** public `GET /api/random` returns `{ lat, lng }`, matching the existing frontend's optional-name contract. `Cache-Control: no-store` prevents cached repeats; selection failures or invalid injected output produce safe HTTP 503. Mounted in `app.ts`; frontend/aggregator code was not changed for this ticket.
- **Checks:** all 14 new tests passed, including holes/boundaries, all major continents/open oceans, deterministic rejection and 1,000 selections, route errors/no-store and existing frontend API-consumer compatibility. Combined Person 4 regression run passed all 95 tests. Workspace typechecks, backend build and separate new-test typecheck passed. A compiled-JS smoke test generated five land-mask points, proving the JSON asset was included in build output. The running frontend proxy returned HTTP 200 and valid coordinates from `/api/random`.
- **Manual UI step:** user can click Random location inside the dashboard to confirm camera/marker movement. Proxy/API consumer were verified; no automated browser click was performed. This route itself is wired and does not need an aggregator entry. Selected points still use `/api/location` for data, whose new provider/country integrations remain with the teammate.
- **Reproduce:** `node --import tsx --test backend/tests/randomLocation.service.test.ts backend/tests/random.route.test.ts` from the repo root.
- **Security/scope:** no environment files or real API keys accessed. Public map data was downloaded at implementation time; runtime endpoint testing used only the keyless offline route. Existing work was backed up/preserved. Core aggregator/cache/registry files remain untouched.

### KAN-32 standalone USGS earthquake service verified locally on 2026-11-15

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/person4-data-modules`. Uncommitted; no push, PR, production registration or frontend wiring performed.
- **Files:** `backend/src/modules/hazards/usgsQuakes.client.ts`, `backend/src/modules/hazards/hazards.service.ts`, `shared/src/modules/earthquakes.ts`, `shared/package.json` (earthquake type export), `backend/tests/earthquakes.client.test.ts`, `backend/tests/earthquakes.service.test.ts`, `backend/tests/fixtures/earthquakes.ts`.
- **Client:** `fetchUsgsQuakes(lat, lng, options?)` makes a public keyless GeoJSON catalog query. Bounded default policy: M2.5+, 500 km radius, last seven days, newest first, at most 100 events. Returns query metadata and validated features; HTTP 204 and an empty feature collection both mean no matching events. Invalid inputs/data/URLs, HTTP failures, cancellation and five-second request/body timeouts produce safe typed `EarthquakeClientError`s. No retries or cache inside the client.
- **Service:** `fetchEarthquakes(lat, lng, options?)` returns `{ status: 'ok', source: 'USGS', data: EarthquakeData }` and throws on failure. Imports for consumers: `@vantage/shared/modules/earthquakes`. Records include id, nullable magnitude/place, UTC event/update timestamps, lat/lng, depthKm, great-circle distanceKm (0.1 km precision) and USGS URL. Negative depths, unknown values and zero values are retained correctly. Response contains filters and `possiblyTruncated` when the returned count reaches the cap, plus USGS source attribution. These are recent catalog records, not predictions or push alerts.
- **Integration handoff:** registry/aggregator owner composes USGS output with NWS in the hazards payload. Earthquakes apply worldwide even when country is unknown or non-US; do not let the current NWS-only `us-only` early return block USGS. Keep subprovider failures isolated and retain country-sensitive caching for the NWS portion. Use cell-center coordinates, the existing hazards TTL (300 seconds), and pass the context `signal` to the service. Existing aggregator/registry/TTL/shared envelope/frontend code was not changed for this ticket.
- **Checks:** all 17 new tests passed, along with selected weather/NWS regressions (45 targeted tests in that run); workspace typechecks, backend build and separate earthquake-test typecheck passed. Live keyless query near San Francisco (37.8, -122.4) returned `ok`, five matching records and `possiblyTruncated: false`; latest event in that response was magnitude 2.89 near Silver Springs, Nevada. Live counts change with time.
- **Reproduce:** `node --import tsx --test backend/tests/earthquakes.client.test.ts backend/tests/earthquakes.service.test.ts` from the repository root.
- **Scope/security:** no environment files or API keys accessed. Live check imported only the keyless earthquake service. No running app/config imports or frontend earthquake test; registry composition, frontend display and live app verification remain with the integration/frontend owners. KAN-24 not started.
- **Provider references:** https://earthquake.usgs.gov/fdsnws/event/1/ and https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php . Radius-filtered catalog is used here instead of downloading a global feed for every grid cell.

### KAN-23 standalone weather service verified locally on 2026-11-15

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/person4-data-modules`. Uncommitted; no push, PR, production registration or frontend wiring performed.
- **Files:** `backend/src/modules/weather/openMeteo.client.ts`, `backend/src/modules/weather/weather.service.ts`, `shared/src/modules/weather.ts`, `shared/package.json` (weather type export only), `backend/tests/weather.client.test.ts`, `backend/tests/weather.service.test.ts`, `backend/tests/fixtures/weather.ts`.
- **Client:** `fetchOpenMeteoWeather(lat, lng, options?)` uses the public keyless forecast endpoint. It requests current weather and one UTC day's maximum UV, explicit Celsius/km/h/mm units and Unix timestamps; validates coordinates, data, ranges, units and daily-array lengths; supports caller cancellation plus a five-second request/body timeout. Missing individual measurements remain null; entirely missing current conditions and malformed responses throw typed `WeatherClientError`s. No retries or cache are added in the client.
- **Provider contract:** `fetchWeather(lat, lng, options?)` returns `{ status: 'ok', source: 'Open-Meteo', data: WeatherData }` and throws on failure. Import the shared payload type from `@vantage/shared/modules/weather`. Payload contains UTC `validAt`, `intervalSeconds`, temperature/feels-like/humidity/wind/precipitation/WMO code/day-night, explicit units, and `dailyUvMax: { dateUtc, index }`. UV is a daily forecast maximum, not instantaneous UV. Weather values are model output, not station observations.
- **Attribution handoff:** frontend must display the returned source link and accessible CC BY 4.0 license link; the payload also describes field/time normalization. Source: https://github.com/open-meteo/open-meteo#data-license . No frontend files were changed for this ticket.
- **Registry handoff:** integration owner adds `weather` with `scope: 'cell'`, `ttlSeconds: TTL_SECONDS.weather` (already 600), and `fetch: ({ cell, signal }) => fetchWeather(cell.lat, cell.lng, { signal })`. No API key/config entry is required. Existing aggregator supplies cache, disabled/error envelopes and fetchedAt. Registry, aggregator and TTL files were left untouched; weather will not appear in the running frontend until registered.
- **Checks:** all 16 new weather tests passed; the selected earlier client/service regressions also passed (56 targeted tests in that run). Workspace typechecks, backend build and separate weather-test typecheck passed. Final weather checks were rerun after adding attribution metadata. A live Atlanta request succeeded, returning 4.3 °C, humidity 72%, wind 7.9 km/h and UTC daily maximum UV 4.3 during the check; these are test-time readings, not fixed expected values.
- **Security/scope:** no environment files or API keys accessed; live check imported only the keyless weather service. No real Mapbox/NWS/auth requests, running app/config imports, frontend build or browser weather check performed. KAN-32/KAN-24 not started.
- **Reproduce:** `node --import tsx --test backend/tests/weather.client.test.ts backend/tests/weather.service.test.ts` from the repository root.

### KAN-22 standalone country resolver verified locally on 2026-11-15

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Current working branch:** `feature/person4-data-modules`. All work remains uncommitted; PR and live integration are pending.
- **Files:** `backend/src/modules/geo/mapboxReverseGeocoding.client.ts`, `backend/src/modules/geo/geo.service.ts`, `backend/tests/reverseGeocoding.client.test.ts`, `backend/tests/geo.service.test.ts`.
- **Client:** `reverseGeocode(lat, lng, accessToken, options?)` requests the Mapbox v6 country layer with explicit latitude/longitude and returns an uppercase two-letter country code or `null` when unavailable. Coordinates, payloads and codes are validated; missing credentials, HTTP/network failures and five-second request/body timeouts produce sanitized `GeocodingError`s.
- **Integration handoff:** `createCountryResolver(accessToken, options?)` returns the existing aggregator's `(lat, lng) => Promise<string | null>` callback. The integration owner must provide the configured token and pass this callback as `resolveCountry` in `app.ts`. Aggregator/cache/registry code was not modified. No endpoint or frontend code was added for this ticket.
- **Checks:** 16 new tests passed, including mocked existing-aggregator compatibility, country override bypass and failure isolation. Prior forward-geocoding/NWS tests also passed (48 total); workspace typechecks, backend build and separate new-test typecheck passed. No environment files, real API keys, live Mapbox requests or real browser country lookup were accessed/performed.
- **Reproduce:** `node --import tsx --test backend/tests/reverseGeocoding.client.test.ts backend/tests/geo.service.test.ts` from the repo root.
- **Remaining:** teammate production wiring and user live verification. Until wired, the dashboard can still show "Country unknown". Country results follow the Mapbox response, not a bounding-box guess; unresolved results remain `null`.

### KAN-21 forward geocoding implemented locally on 2026-11-15

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/kan21-forward-geocoding`. Not committed, pushed, or merged; live user verification and PR remain.
- **User follow-up:** the user manually verified Atlanta search/selection in the frontend (marker and dashboard with correct coordinates). Work is now being collected uncommitted on `feature/person4-data-modules`; commit/PR remain.
- **Files:** `backend/src/modules/geo/mapboxGeocoding.client.ts`, `backend/src/routes/geocode.ts`, `backend/src/app.ts` (geocode route wiring only), `backend/tests/geocoding.client.test.ts`, `backend/tests/geocode.route.test.ts`.
- **Contract:** `GET /api/geocode?q=...` returns `{ results: GeocodeResult[] }`. The client directly returns `{ id, name, context?, lat, lng }`; Mapbox's `[longitude, latitude]` tuple is validated and mapped without rounding. Preferred/short names and optional place context are separated, with full-address/ID label fallbacks.
- **Validation and errors:** uses the existing shared `geocodeQuerySchema` (trimmed query, 1–200 characters); invalid queries return 400, unavailable configuration 503, upstream failures 502, and timeouts 504. Malformed JSON/coordinates fail rather than being reported as no matches. Native five-second fetch timeout covers body reading; `lib/http.ts` is still empty and was not changed.
- **Configuration:** client takes its token argument explicitly; the router receives an injected configuration callback. Production wiring supplies the already-validated config value when a request runs. No environment files or real API keys were accessed during implementation/testing.
- **Checks:** 20 new geocoding tests plus the existing 12 NWS tests passed (32 total); workspace typechecks, backend build, and separate geocoding-test typecheck passed. Tests cover the real route/client and frontend API consumer using mocked provider data and dummy credentials. No live Mapbox/browser test or Vite production build was run, to avoid accessing configured API keys/environment files.
- **Reproduce:** `node --import tsx --test backend/tests/geocoding.client.test.ts backend/tests/geocode.route.test.ts` from the repository root. Real-key search must be checked by the user before calling live frontend verification complete.
- **Scope:** no aggregator, shared contract/schema, frontend, weather, or reverse-geocoding changes. Existing unrelated local repairs were preserved. Dependency installation used `npm ci --ignore-scripts --no-audit --no-fund` without changing manifests or lockfile.

### Database, authentication, Google OAuth, and Favorites API completed on 2026-10-29

- **Owner:** Aamir Mohammad (amohammad12, agent-assisted).
- **Branches:** `feature/database-setup` merged via PR #1; `feature/auth` merged via PR #5 (commit `ef4780a`, on `dev` at `37e9abb`).
- **Files:** `backend/src/db/client.ts`, `backend/src/db/schema.ts`, `backend/src/db/migrations/001_initial_schema.sql`, `backend/src/db/migrations/002_seed_data_sources.sql`, `backend/src/db/migrations/003_google_oauth.sql`, `backend/src/auth/googleOAuth.ts`, `backend/src/middleware/authenticate.ts`, `backend/src/middleware/requireRole.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/favorites.ts`, colocated `*.test.ts` next to those modules, plus `backend/src/app.ts` (mounts `/api/auth` and `/api/favorites`) and `backend/package.json` (pg, bcrypt, jsonwebtoken, google-auth-library, cookie-parser).
- **Handoff:** `POST /api/auth/register` stores a bcrypt hash (cost 12) and returns a sanitized user (no token). `POST /api/auth/login` returns `{ token, user }` with HS256 JWT claims `{ userId, role }`. Google login is `GET /api/auth/google` → Google → `GET /api/auth/google/callback`; it uses PKCE, signed cookies for state/verifier, and the same JWT shape. Google-only users have `password_hash = NULL` and a unique `google_sub`. An existing email/password account is **not** auto-linked (409). Favorites (`POST/GET /api/favorites`, `DELETE /api/favorites/:favoriteId`) require `Authorization: Bearer` and `requireRole("user")` (admins inherit user access).
- **Not in this work:** logout, profile, admin API, frontend auth UI, and reading `data_sources.is_enabled` from Neon.
- **Checks:** colocated automated tests for the DB client, seed + Google migrations, register, login, Google OAuth, JWT middleware, roles, and favorites. Google OAuth was verified manually against the live consent screen. Workspace TypeScript checks and the backend build succeeded for this work.

### Standalone NWS client completed on 2026-10-29

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/nws-alerts-client`, pushed to GitHub (commit `4eaacd3`).
- **Files:** `backend/src/modules/hazards/nwsAlerts.client.ts`, `backend/tests/nwsAlerts.client.test.ts`.
- **Handoff:** call `fetchNwsAlerts({ lat, lng, countryCode }, { userAgent })` with an explicit ISO country code and configured User-Agent supplied by the caller. This client never loads environment files or reads `process.env`. The current scope is country code `US`; other country codes return `not_applicable` without a request. Do not infer US coverage using a rectangular coordinate boundary.
- **Output:** provider result `{ status: 'ok', source: 'NWS', alerts }` (an empty list means no active alerts) or `{ status: 'not_applicable', source: 'NWS', reason }`. Failures throw `NwsClientError` with `code` and an optional HTTP `status`; upstream bodies and caller contact details are not included in errors.
- **Integration:** done by Lance on 2026-10-29. The client is registered as the `hazards` module in `moduleRegistry.ts`, wrapped in `ModuleResult` and cached per cell + country by the aggregator.
- **Checks:** 12 tests passed; workspace typechecks, backend build, and test typecheck passed. A live Atlanta request succeeded with zero active alerts using a non-secret validation User-Agent. Run tests from the repo root with `node --import tsx --test backend/tests/nwsAlerts.client.test.ts`.

### Dashboard panel, Random button, Saved Locations and ModuleCard completed on 2026-11-14

- **Owner:** Mario Sepriano (hello-world-42; agent-assisted).
- **Branch:** `feature/dashboard`.
- **Files:** `frontend/src/components/LocationPanel/{LocationPanel,DefaultState,LocationDetails}.tsx`, `frontend/src/components/modules/ModuleCard.tsx`, `frontend/src/components/RandomButton/RandomButton.tsx`, `frontend/src/components/favorites/{SavedLocations.tsx,useFavorites.ts}`, `frontend/src/hooks/{useLocationData,useAuth}.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/api/client.ts`, `frontend/src/types.ts`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/components/Globe/Globe.tsx` (clears its marker when the selection is cleared; Random/Saved fly like search).
- **Dashboard:** with no location selected it shows the default state (Random button + Saved Locations). Selecting a location shows one `ModuleCard` per module returned by `GET /api/location`, with a Back button that returns to the default state. The "Open dashboard" button now appears whenever the panel is collapsed, even with no location.
- **ModuleCard handoff:** `<ModuleCard title result onRetry>{(data, meta) => ...}</ModuleCard>` owns the loading / ok / not_applicable / error / disabled states; a module component only renders its own `data`. `LocationDetails.tsx` currently renders each module's data as raw JSON (`RawData`). **Replace it per module** as `WeatherModule.tsx` etc. are built.
- **Auth handoff:** `AuthContext` stores `{ token, user }` (localStorage key `vantage.auth`) and exposes `login(token, user)` / `logout()` via `useAuth()`. There is no login UI yet; the login modal should call `login()` with the `{ token, user }` body from `POST /api/auth/login`. Saved Locations sends `Authorization: Bearer` and logs the user out on a 401.
- **Checks:** workspace typecheck and `vite build` pass. Eight throwaway jsdom behavior tests (not committed) passed against a stubbed backend: all five ModuleCard states, Random success/failure/malformed response, Saved Locations as guest and signed in (load, select, delete, empty, retry, 401 logout), and the panel's default / selected / error states. **Not verified in a live browser:** the globe marker clearing and fly-to for Random/Saved, and the panel slide animation.

| Date | Who | What | Key files |
|---|---|---|---|
| 2026-09-29 | Lance | Initial repo + folder skeleton | all placeholder files |
| 2026-10-08 | Lance | Wireframes (7 screens, Figma) | Figma file |
| 2026-10-15 | Lance | API accounts (shared team email) + `.env.example` | `.env.example` |
| 2026-10-15 | Mario | Mapbox globe, search UI, dashboard panel shell, API client, frontend workspace | `frontend/**`, `shared/src/contract.ts` |
| 2026-10-15 | Mohammed | Mapbox forward geocoding client | `backend/src/modules/geo/mapboxGeocoding.client.ts` |
| 2026-10-15 | Aamir | Neon schema SQL + TS types (later merged) | `backend/src/db/migrations/001_initial_schema.sql`, `backend/src/db/schema.ts` |
| 2026-10-27 | Lance | npm workspaces, Express app with `/api/health`, root `npm run dev`, `.gitignore`; merged with `dev` | `package.json`, `tsconfig.base.json`, `backend/**`, `.gitignore` |
| 2026-10-27 | Mario | Globe height fix; single root `.env` (Vite `envDir`); proxy → 3000 | `Globe.tsx`, `vite.config.ts` |
| 2026-10-27 | Lance | Backend loads root `.env`; zod upgraded to v4 (security fix); removed `jobs/` | `backend/src/server.ts`, `backend/package.json`, `.env.example` |
| 2026-10-29 | Mohammed | NWS alerts client + 12 tests | `backend/src/modules/hazards/nwsAlerts.client.ts`, `backend/tests/nwsAlerts.client.test.ts` |
| 2026-10-29 | Lance | Backend core: shared ModuleResult contract + zod schemas, env validation, grid snapping, memory cache + TTL policy, singleflight, module registry (NWS as hazards), aggregator, `GET /api/location`, 17 tests | `shared/src/contract.ts`, `shared/src/schemas.ts`, `shared/package.json`, `backend/src/config/env.ts`, `backend/src/lib/grid.ts`, `backend/src/lib/singleflight.ts`, `backend/src/cache/cache.ts`, `backend/src/cache/memoryCache.ts`, `backend/src/cache/ttlPolicy.ts`, `backend/src/aggregator/*`, `backend/src/routes/location.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/tests/{aggregator,cache,grid,location.route}.test.ts` |
| 2026-11-15 | Lance | Error handler, `lib/http.ts`, `npm test`, README, CI, rate limits; astronomy, space and sky-conditions cards; hazards combines NWS + USGS; weather registered; country lookup wired; throttle, distance, global-list and sub-source helpers; static-data preprocessing | see the Lance entry above |
| 2026-11-14 | Mario | Dashboard panel (default + selected states), Random button, Saved Locations, generic ModuleCard, minimal auth context, location data hook | `frontend/src/components/{LocationPanel,modules,RandomButton,favorites}/**`, `frontend/src/{hooks,context,api,types.ts,App.tsx,main.tsx}`, `Globe.tsx` |
| 2026-10-29 | Aamir | Neon pool, migrations 001–003, six seeded data sources, email/password auth, JWT + role middleware, Google OAuth, protected Favorites API | `backend/src/db/**`, `backend/src/auth/**`, `backend/src/middleware/authenticate.ts`, `backend/src/middleware/requireRole.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/favorites.ts` |

---

## 7. Known Issues / Decisions Needed

**Resolved (Sprint 2):**
- **`password_hash` is nullable for Google users.** Migration `003_google_oauth.sql` drops `NOT NULL`, adds unique `google_sub`, and requires at least one auth method. *(Aamir)*
- **`002_seed_data_sources.sql` seeds six providers** (Open-Meteo, USGS, NWS, NOAA SWPC, N2YO, Launch Library 2) and is safe to rerun. *(Aamir)*
- **`feature/database-setup` is merged** into `dev` (PR #1), after merging `dev` in and keeping `dev`'s `.gitignore`. `feature/auth` is also merged (PR #5). *(Aamir)*

**Open:**

1. **Geocode shape mismatch resolved locally under KAN-21:** client now returns shared `GeocodeResult`; PR pending. *(Mohammed)*
2. **Forward route implemented locally under KAN-21:** mocked route/client/frontend-consumer checks passed; live user search check and PR pending. *(Mohammed)*
3. **Geocoding timeout added locally under KAN-21:** five-second native fetch timeout, including body reading. `lib/http.ts` now exists; switching to it is optional since the client's own timeout already works. *(Mohammed)*
4. **Vite bundle > 500 kB** (Mapbox). Expected; not a problem for now.
5. **Country lookup is wired** (Lance, 2026-11-15): Mohammed's `createCountryResolver` is passed to the aggregator as `resolveCountry` when `MAPBOX_TOKEN` is set, cached per cell for 30 days. Without the token the country stays unknown unless `?country=` is passed. Not yet checked with a real token. *(Mohammed + Lance)*
6. **`data_sources` check isn't wired yet.** The table is seeded, but the aggregator still defaults to "all enabled". It already accepts `isEnabled(id)`; once wired it should read `data_sources.is_enabled`. *(Aamir + Lance)*
7. **`CACHE_DRIVER=redis` isn't implemented**; the app always uses the memory cache for now.
8. **Random endpoint implemented locally under KAN-24.** Response `{ lat, lng }` matches the frontend's optional-name contract. Offline mask selection, route and existing API consumer tested; frontend proxy returned HTTP 200. User browser interaction and commit/PR remain. See Section 6 for coarse-mask limitations. *(Mohammed)*
9. **Where the JWT lives in the browser.** `AuthContext` keeps it in `localStorage` so Saved Locations survives reloads. Revisit when the login modal is built (localStorage is readable by any XSS; the alternative is memory-only or an httpOnly cookie). Also undecided: `GET /api/auth/google/callback` returns JSON, so the SPA needs a way to receive the token after the Google redirect. *(Aamir + Mario)*
10. **`/api/location` returns every module in one response**, so the dashboard waits on the slowest module and shows all cards at once. There is no per-module endpoint for progressive loading. Decide whether that's acceptable. *(Lance)*

---

## 8. Remaining Work (not claimed yet)

Claim an item by moving it to Section 5 with your files.

- **Data modules:** air quality, ocean (Open-Meteo Marine); hazard sources FIRMS and GVP (plug into `hazards.service.ts`); NOAA SWPC aurora (plugs into `space.service.ts`)
- **Run the preprocessing once on the real files:** `scripts/preprocess-static/preprocess.py` is written and tested on sample data, but needs the real VIIRS VNL and SEDAC GPW downloads (EOG account, Earthdata login). Each output grid is ~4 MB; decide whether to commit them or keep them on the server
- **Middleware still empty:** `validate.ts` (`authenticate`, `requireRole`, `errorHandler` and `rateLimit` are done)
- **Auth leftovers:** `POST /api/auth/logout`, `GET/PUT /api/profile`
- **Optional cache pieces:** `cache/redisCache.ts` (Upstash)
- **Frontend:** module components replacing the raw-JSON placeholder (Weather, AirQuality, Astronomy, Hazards, Ocean, SkyConditions, Space), landing page, login/register modal (with Google), profile page, `Attribution.tsx`, favorites star in search results (there is currently no way to *add* a favorite from the UI)
- **Admin API** (no UI): manage users; enable/disable data sources
- **Deployment** (hosting TBD) and production OAuth redirect URIs
- **Class deliverables:** testing scenarios write-up, sprint reports

---

## 9. Change Log

> Add one line per change: `YYYY-MM-DD · Name (GitHub) · agent-assisted? · what changed`

- 2026-11-15 · Lance Santiago (LanceSan04) · agent-assisted · Added the error handler, `lib/http.ts`, `npm test`, README, CI and rate limits; added the astronomy, space and sky-conditions cards and the static-data preprocessing script; made hazards one card combining NWS + USGS; registered weather; wired the country lookup. 231 tests pass. New deps: express-rate-limit, suncalc. New env: `TRUST_PROXY`, `STATIC_DATA_DIR`. Shared module types now export `./modules/*`. Updated Sections 3.2, 3.3, 3.6, 4, 5 (my claim, how to add a module or hazard source), 6, 7 (items 3, 5), 8.

- 2026-11-15 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented KAN-24 offline land-biased sampling and `/api/random` using public-domain Natural Earth polygons. All 14 new tests and the combined 95-test Person 4 suite passed, plus typechecks/backend build/compiled-asset smoke test. Frontend proxy returned HTTP 200. Updated SPEC after verification; no environment-file/API-key access, no commit/push.

- 2026-11-15 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented standalone KAN-32 USGS radius client/service/shared types; 17 new tests plus selected weather/NWS regressions, typechecks and backend build passed. Keyless live query returned five events. Updated SPEC after verification; worldwide USGS/NWS composition remains with teammate. No environment-file/API-key access; uncommitted.

- 2026-11-15 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented standalone KAN-23 Open-Meteo client/service/shared weather type; 16 new tests, selected regression tests, workspace typechecks, backend build and test typecheck passed; keyless Atlanta request succeeded. Updated SPEC after verification. Teammate registry/frontend wiring remains; all work uncommitted, no environment-file/API-key access.

- 2026-11-15 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented standalone KAN-22 reverse country client/resolver with 16 new tests; 48 combined tests, workspace typechecks, backend build and new-test typecheck passed. Updated SPEC after verification. Production wiring remains with teammate; no environment files or real API keys accessed. Uncommitted on `feature/person4-data-modules`.

- 2026-11-15 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented KAN-21 forward geocoding route and shared-result normalization on `feature/kan21-forward-geocoding`; added 20 tests, validated alongside 12 NWS tests, workspace typechecks and backend build. Mocked responses/dummy credentials only; live check and PR pending. No environment files or real API keys accessed.

- 2026-11-14 · Mario Sepriano (hello-world-42) · agent-assisted · Built the dashboard panel (default state + selected-location view), Random location button, Saved Locations, generic `ModuleCard`, minimal `AuthContext`/`useAuth`, and `useLocationData`; Globe now clears its marker when the selection is cleared. Confirmed the Section 5 claim; updated Sections 3.6, 4, 5, 6, 7 (items 8–10) and 8.

- 2026-10-29 · Aamir Mohammad (amohammad12) · agent-assisted · Updated SPEC.md to match `dev` at `37e9abb`: filled in GitHub username, documented merged database/auth/OAuth/favorites work, Lance's aggregator/cache/contract/location API, endpoint and branch statuses, remaining profile/logout/admin work, and resolved known issues 3–5.

- 2026-10-29 · Aamir Mohammad (amohammad12) · agent-assisted · Implemented Neon PostgreSQL (schema, pool, migrations 001–003, six seeded data sources), email/password auth (bcrypt + JWT), authenticate/requireRole middleware, Google OAuth (PKCE + `003_google_oauth.sql`), and the protected Favorites API; merged to `dev` via PRs #1 and #5.

- 2026-10-29 · Lance Santiago (LanceSan04) · agent-assisted · Built backend core (contract, schemas, env, grid, cache, singleflight, registry, aggregator, `/api/location`) with 17 tests; registered Mohammed's NWS client as the hazards module; updated Sections 3.6, 4, 5, 6, 7. Corrected the NWS entry: it was pushed, not local-only.

- 2026-10-29 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented and tested the standalone NWS point-alert client on `feature/nws-alerts-client`; explicit User-Agent/country inputs, no environment-file access, no aggregation integration.

- 2026-10-27 · Lance Santiago (LanceSan04) · agent-assisted · Created SPEC.md from the current `dev` branch, sprint plan and design decisions.
