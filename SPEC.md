# VANTAGE: PROJECT SPEC

> **What this file is for.** This is the single source of truth for the Vantage project. Every teammate, and every coding agent working for a teammate, reads this file **before** making changes and updates it **after**. It says what we're building, how the code is organized, what's done, what's in progress, and **who owns which files right now**, so two people never edit the same file at the same time.

Last updated locally: 2026-11-15 by Mohammed Hussain Shareef Shaik (agent-assisted; uncommitted)

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
| Frontend | React 19, Vite 8, Tailwind CSS 4, Mapbox GL JS 3, TypeScript; d3-geo + topojson-client + world-atlas (landing-page globe only) |
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
- **Module registry** lists each module's `id`, `scope` (`cell` / `global` / `us-only`), `ttlSeconds` and `fetch` function.
- **Grid snapping.** Coordinates snap to a grid cell (start with 0.25°) and we fetch for the cell **center**. That makes nearby clicks share one cache entry.
- **Lazy (on-demand) caching, no background jobs.** Data is fetched the first time someone needs it, then cached until its TTL expires. Free hosting sleeps when idle, so scheduled jobs wouldn't run. The `jobs/` folder was removed on purpose; **don't re-add it.**
- **Singleflight.** Duplicate in-flight requests for the same key share one upstream call.
- **Timeouts.** Every upstream call is wrapped with a ~5 s `AbortController` timeout (`lib/http.ts`).
- **Global-list sources** (Launch Library 2, GVP volcanoes) are cached under **one** key and filtered by distance in our code. Never cache them per cell.
- **Admin can disable providers** through the `data_sources` table. The aggregator checks it and returns `disabled` for those modules.
- **`app.ts` / `server.ts` split.** `app.ts` builds the Express app (testable without a port); `server.ts` loads env and calls `listen()`.
- **Auth tokens.** Email/password login and Google OAuth both return a JWT (`Authorization: Bearer`). Google OAuth uses PKCE plus short-lived signed HttpOnly cookies for `state` and the code verifier only.

### 3.3 Environment

- **One `.env` at the repo root**, shared by backend and frontend. Copy `.env.example` → `.env` and fill it in.
- The backend loads it in `backend/src/server.ts`; Vite reads it via `envDir` in `frontend/vite.config.ts`.
- Only variables starting with `VITE_` reach the browser. **Only `VITE_MAPBOX_TOKEN` (public) and `VITE_API_URL` belong there.**
- Backend port: **3000**. Frontend dev server: **5173**. The Vite proxy forwards `/api` → `localhost:3000`.
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
| GET | `/api/location?lat=&lng=[&country=]` | — | ✅ Done (hazards module only: NWS alerts) |
| GET | `/api/random` | — | ✅ KAN-24 implemented locally; offline land-biased selection, proxy HTTP 200 verified, commit/PR pending |
| POST | `/api/auth/register`, `/api/auth/login` | — | ✅ Done (bcrypt + JWT) |
| POST | `/api/auth/logout` | — | ❌ Not started |
| GET | `/api/auth/google`, `/api/auth/google/callback` | — | ✅ Done (PKCE; returns the same JWT shape as password login). ⚠️ The callback answers with JSON, so the browser app can't finish Google login yet. See Section 7 item 11 |
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
│   ├── package.json             ✅ exports ./src/contract.ts and ./schemas; depends on zod 4
│   ├── tsconfig.json            ✅
│   └── src/
│       ├── contract.ts          ✅ GeocodeResult, ModuleId, ModuleStatus, ModuleResult<T>, GridCell, LocationResponse
│       └── schemas.ts           ✅ zod: locationQuerySchema, geocodeQuerySchema
│
├── backend/                     @vantage/backend
│   ├── package.json             ✅ express, helmet, cors, dotenv, zod 4, tsx, pg, bcrypt, jsonwebtoken, google-auth-library, cookie-parser
│   ├── tsconfig.json            ✅
│   ├── tests/                   ✅ node:test suites (aggregator, cache, grid, location route, NWS client)
│   └── src/
│       ├── app.ts               ✅ helmet, CORS, JSON, /api/health, aggregator + /api/location, /api/auth, /api/favorites, 404
│       ├── server.ts            ✅ listen(env.PORT)
│       ├── config/env.ts        ✅ loads root .env, validates with zod, exports typed `env`
│       ├── aggregator/          ✅ moduleRegistry.ts (hazards/NWS registered), aggregateLocation.ts
│       ├── auth/                ✅ googleOAuth.ts (+ tests)
│       ├── cache/               ✅ cache.ts, memoryCache.ts, ttlPolicy.ts · ⬜ redisCache.ts
│       ├── lib/                 ✅ grid.ts, singleflight.ts · ⬜ geo.ts, http.ts, throttle.ts
│       ├── middleware/          ✅ authenticate, requireRole (+ tests) · ⬜ errorHandler, rateLimit, validate
│       ├── routes/              ✅ location.ts, auth.ts, favorites.ts (+ tests), geocode.ts + random.ts (local) · ⬜ admin, profile
│       ├── db/                  ✅ client.ts, schema.ts, migrations/001_initial_schema.sql, 002_seed_data_sources.sql, 003_google_oauth.sql (+ tests)
│       └── modules/
│           ├── geo/             ✅ forward/reverse clients, geo.service.ts, randomLocation.service.ts, landMask.ts + offline land data (local)
│           ├── weather/         ✅ openMeteo.client.ts, weather.service.ts (KAN-23 local, registry wiring pending)
│           ├── airQuality/      ⬜ airQuality.service.ts, openAq.client.ts, openMeteoAirQuality.client.ts
│           ├── astronomy/       ⬜ astronomy.service.ts, astronomyApi.client.ts, suncalc.service.ts
│           ├── hazards/         ✅ nwsAlerts.client.ts (registered), usgsQuakes.client.ts + hazards.service.ts (KAN-32 local, USGS wiring pending) · ⬜ nasaFirms, gvpVolcano clients
│           ├── ocean/           ⬜ ocean.service.ts, openMeteoMarine.client.ts
│           ├── space/           ⬜ space.service.ts, n2yo, launchLibrary, noaaSwpc clients
│           └── staticData/      ⬜ staticData.service.ts
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
│       │   ├── LocationPanel/   ✅ LocationPanel (floating card + collapsed tab), DefaultState, LocationDetails, layout.ts
│       │   ├── Logo.tsx, TopBar.tsx   ✅ original orbit-mark logo; dark top bar
│       │   ├── GlobeIllustration.tsx    ✅ landing globe: d3-geo orthographic, Natural Earth 1:110m land, slow spin
│       │   ├── Attribution.tsx                  ✅ data-source credits (landing page footer)
│       │   ├── modules/         ✅ ModuleCard · ⬜ Weather/AirQuality/Astronomy/Hazards/Ocean/SkyConditions/Space
│       │   ├── RandomButton/RandomButton.tsx    ✅
│       │   ├── favorites/       ✅ SavedLocations.tsx, useFavorites.ts
│       │   ├── auth/            ✅ AuthModal.tsx, GoogleMark.tsx
│       │   └── profile/, admin/   📁
│       ├── context/             ✅ AuthContext.tsx (session), AuthModalContext.tsx (opens the login dialog)
│       ├── pages/               ✅ LandingPage (/), GlobePage (/globe), AuthCallbackPage (/auth/callback)
│       ├── router.tsx           ✅ tiny History-API router (no dependency)
│       ├── lib/jwt.ts           ✅ base64url decode, token-expiry check
│       └── hooks/               ✅ useAuth.ts, useAuthModal.ts, useLocationData.ts
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

Other scripts: `npm run dev:backend`, `npm run dev:frontend`, `npm run build`, `npm run typecheck`.

Backend tests (from the repo root; a root `npm test` script is coming):

```bash
node --import tsx --test backend/tests/*.test.ts backend/src/**/*.test.ts
```

Try the aggregator: `http://localhost:3000/api/location?lat=33.75&lng=-84.39&country=US` (needs `NWS_USER_AGENT` in `.env`).

Auth and favorites need `DATABASE_URL` and `JWT_SECRET`. Google login also needs the `GOOGLE_*` variables and a matching authorized redirect URI.

---

## 5. In Progress (claimed files: don't touch unless you're the owner)

> Format: **Owner** · branch · started · goal · exact files. Remove your entry when done and move it to Section 6.
> Entries marked *(from sprint plan, confirm)* were assigned in the sprint plan but the owner hasn't confirmed the claim yet. Owners: confirm or edit your entry.

### Lance Santiago (LanceSan04): foundation cleanup
- **Branch:** `feature/backend-core` · **Started:** 2026-10-29
- **Goal:** root `npm test` script, JSON error handler, README setup steps. (Backend core steps 1–6 are done; see Section 6.)
- **Files:**
  - `package.json` (root, scripts only)
  - `backend/src/middleware/errorHandler.ts`
  - `README.md`
- **Shared integration points Lance maintains** (other owners may add their *own* entry, then tell Lance):
  - `shared/src/contract.ts`: add a new `ModuleId` when you add a module. Put your module's data type in your own file under `shared/src/modules/` instead of editing the envelope types.
  - `backend/src/aggregator/moduleRegistry.ts`: add your module's entry to `createModuleRegistry()`. Don't change the aggregator itself.
  - `backend/src/cache/ttlPolicy.ts`: one line per module.

**How to add a data module** (the contract every module follows):
1. Write the client in `backend/src/modules/<area>/`. Return `{ status: "ok", source, data }` or `{ status: "not_applicable", source?, reason }`, and **throw** on failure. Don't read `process.env`; take keys as arguments.
2. Add an entry in `moduleRegistry.ts` with `id`, `label`, `scope` (`cell` / `global` / `us-only`), `ttlSeconds` (from `ttlPolicy.ts`) and `fetch(context)`. Use `context.cell.lat/lng` (the cell center), not the raw click.
3. Pass any key it needs from `env` in `app.ts` → `createModuleRegistry({...})`.
4. The aggregator handles caching, singleflight, timeouts (8 s), the disabled check and turning throws into `{ status: "error" }`.

### Aamir Mohammad (amohammad12): profile API and data-source admin wiring
- **Branch:** start a new `feature/...` from `dev` (`feature/database-setup` and `feature/auth` are merged)
- **Goal:** profile routes next; then logout if the team wants a server endpoint; then wire `data_sources.is_enabled` into the aggregator with Lance.
- **Files:**
  - `backend/src/routes/profile.ts`
  - Next: `backend/src/routes/auth.ts` (logout only, if added), `backend/src/routes/admin.ts`
- **Do not edit** Lance's aggregator/cache/contract files without coordinating. The aggregator already accepts `isEnabled(id)`; wiring it to Neon is a joint step (see Section 7).

### Mario Sepriano: frontend dashboard
- **Branch:** `feature/auth-ui` (started 2026-11-15)
- **Goal:** auth UI, landing page and the dashboard restyle are done (see Section 6). Next: the module-specific components.
- **Files still claimed:**
  - `frontend/src/components/Globe/Globe.tsx`, `frontend/src/components/Search/Search.tsx`, `frontend/src/components/LocationPanel/*`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/types.ts`, `frontend/src/api/client.ts`, `frontend/src/index.css`
  - `frontend/src/components/modules/*`, `frontend/src/components/auth/*`, `frontend/src/components/TopBar.tsx`, `frontend/src/pages/*`, `frontend/src/router.tsx`
  - `frontend/src/context/*`, `frontend/src/hooks/*`, `frontend/src/lib/*`, `frontend/package.json` (dependencies)

---

## 6. Completed

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

### Dashboard restyle, landing globe and top bar polish completed on 2026-11-15

- **Owner:** Mario Sepriano (hello-world-42, agent-assisted).
- **Branch:** `feature/auth-ui` (same PR as the auth UI).
- **Files:** `frontend/src/components/LocationPanel/{LocationPanel.tsx,layout.ts}`, `frontend/src/components/Globe/Globe.tsx`, `frontend/src/components/GlobeIllustration.tsx`, `frontend/src/components/{TopBar,Logo}.tsx`, `frontend/src/pages/LandingPage.tsx`, `frontend/src/index.css`, `frontend/package.json` + root `package-lock.json` (new deps below).
- **Dashboard (Figma screens 02, 03, 06):** desktop panel is a rounded card floating 16px (`PANEL_MARGIN`) in from the top/right/bottom of the map area; the globe's camera offset is `PANEL_WIDTH + PANEL_MARGIN`. Collapsed, a tall ◀ pill sits on the right edge (mobile: a short ▲ pill at the bottom). Zoom is one upright pill at the bottom left, split into + / −, using Mapbox `zoomIn`/`zoomOut`; a half dims while pressed and greys out at the zoom limit. On mobile the pill moves above the open bottom sheet. It sits above the Mapbox logo, which must stay visible.
- **Landing globe:** real orthographic projection of Natural Earth 1:110m land (`world-atlas`, public domain data, ISC package) with a graticule, turning once a minute; still for reduced-motion users. The 55 KB land file loads as a separate asset after first paint, once per page load.
- **Top bar:** darker charcoal gradient (`vt-topbar` tokens), soft shadow, blue hairline glow along the bottom; landing footer matches. Logo is back to the original orbit mark + "Vantage".
- **New dependencies (frontend):** `d3-geo`, `topojson-client`, `world-atlas`; dev: `@types/d3-geo`, `@types/topojson-client`. Used only by the landing globe.
- **Not changed (still open from the wireframe review):** panel colors (still navy, wireframe is grey), "Dashboard ▶" header, keeping Random/Saved visible when a place is selected, the ★ Save button, saved-row styling, red map marker.
- **Checks:** typecheck and `vite build` pass. 25 tests (3 against the real auth router): new ones cover the ◀ tab, the 436px globe offset, the zoom buttons and their limits, the mobile zoom position, and the landing globe drawing land (and degrading without it). A deliberate break of the offset was caught. Screenshots at 1260px and 390px reviewed; pressed zoom state measured (40% dark overlay). **Not verified:** with a real Mapbox token (map tiles), or on a touch device.

### Login/register modal, top bar and landing page completed on 2026-11-15

- **Owner:** Mario Sepriano (hello-world-42, agent-assisted).
- **Branch:** `feature/auth-ui`.
- **Files:** `frontend/src/components/auth/{AuthModal,GoogleMark}.tsx`, `frontend/src/components/{TopBar,Logo,GlobeIllustration,Attribution}.tsx`, `frontend/src/context/AuthModalContext.tsx`, `frontend/src/hooks/useAuthModal.ts`, `frontend/src/pages/{LandingPage,GlobePage,AuthCallbackPage}.tsx`, `frontend/src/router.tsx`, `frontend/src/lib/jwt.ts`, `frontend/src/App.tsx` (now just the route table), `frontend/src/main.tsx`, `frontend/src/api/client.ts` (`login`, `register`, 400 `details`), `frontend/src/context/AuthContext.tsx` (drops expired tokens on load), `frontend/src/types.ts`, `frontend/src/index.css` (wireframe color tokens `vt-*`, focus ring), `frontend/src/components/LocationPanel/LocationPanel.tsx` (`fixed` → `absolute` so it sits under the top bar).
- **Landing page (matches Figma screen 01):** line-art globe, VANTAGE heading, "Explore the World from Every Angle", description, "Explore the Globe →" button, and the attribution footer (`Attribution.tsx`: Open-Meteo, USGS, NOAA, NASA, Mapbox, each linked).
- **Routes:** `/` landing page, `/globe` globe + dashboard (the old `App.tsx` body), `/auth/callback` Google return page. Unknown paths redirect to `/`. **Hosting must serve `index.html` for these paths** (Vite dev/preview already do).
- **Modal (matches Figma screen 05):** Log in / Register tabs at the top with ✕ on the right, then "Login with Google", then the form, then "Don’t have an account? Register" (or "Already have an account? Log in"). Register calls `POST /api/auth/register`, then `POST /api/auth/login` (register returns no token). Client-side checks mirror the backend's zod rules (username 1–100, valid email, password 8–72 bytes). Handles 400 field `details`, 401 (with a "signed up with Google?" hint), 409 ("Log in instead"), 429, 5xx and network errors. Escape/backdrop/✕ close it; focus is trapped inside and returned to the trigger. Open it from anywhere with `useAuthModal().openAuth('login' | 'register')`. **Left out on purpose:** screen 05's "Forgot password?" link (no reset endpoint; see Section 7 item 12). **Added beyond the wireframe:** a Show/Hide password toggle.
- **Top bar:** Vantage logo (links to `/`), Log in / Register for guests, avatar initial + menu (username, email, Log out) when signed in. Log out is client-side only (no `/api/auth/logout` yet).
- **Checks:** typecheck and `vite build` pass. 3 tests drove the real modal against the **real** auth router (bcrypt, JWT, zod; in-memory user table instead of Neon): register → auto-login → log out → log in, wrong password, duplicate email, server-side field errors. 17 more against a stubbed backend: routing, landing page and attribution links, the screen-05 field order, every modal close/focus path, validation, error messages, aborting on close, expired-token handling, Saved Locations → modal → favorites load, and the Google return page (success, each error, malformed/expired data). Two deliberate breakages were each caught. Screenshots of the production build at 1250px and 390px were compared against Figma screens 01 and 05. **Not verified:** real Google login (blocked on Section 7 item 11), real Neon database, a live Mapbox globe under the new top bar.

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
| 2026-11-14 | Mario | Dashboard panel (default + selected states), Random button, Saved Locations, generic ModuleCard, minimal auth context, location data hook | `frontend/src/components/{LocationPanel,modules,RandomButton,favorites}/**`, `frontend/src/{hooks,context,api,types.ts,App.tsx,main.tsx}`, `Globe.tsx` |
| 2026-11-15 | Mario | Login/register modal (screen 05), landing page with attribution footer (screen 01), top bar with avatar menu, routes (`/`, `/globe`, `/auth/callback`) | `frontend/src/{components/auth,pages,context,hooks,lib}/**`, `TopBar.tsx`, `Logo.tsx`, `Attribution.tsx`, `router.tsx`, `App.tsx`, `main.tsx`, `api/client.ts` |
| 2026-11-15 | Mario | Dashboard restyle (floating card, ◀ collapsed tab, zoom pill), landing globe with real continents, darker top bar, original logo restored | `LocationPanel/*`, `Globe.tsx`, `GlobeIllustration.tsx`, `TopBar.tsx`, `Logo.tsx`, `index.css`, `frontend/package.json` |
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
3. **Geocoding timeout added locally under KAN-21:** five-second native fetch timeout, including body reading. Adopt `lib/http.ts` when implemented; it is currently empty. *(Mohammed)*
4. **Vite bundle > 500 kB** (Mapbox). Expected; not a problem for now.
5. **Country resolver implemented locally under KAN-22; production wiring pending.** `reverseGeocode` and `createCountryResolver` are tested with mock responses and the existing aggregator. The integration owner must pass the resolver into `createAggregator` in `app.ts`; until then the backend cannot infer country automatically and `/api/location?country=US` remains the manual override. No live lookup was run because real-key/environment access was prohibited. *(Mohammed completed standalone client/service; Lance wires it in)*
6. **`data_sources` check isn't wired yet.** The table is seeded, but the aggregator still defaults to "all enabled". It already accepts `isEnabled(id)`; once wired it should read `data_sources.is_enabled`. *(Aamir + Lance)*
7. **`CACHE_DRIVER=redis` isn't implemented**; the app always uses the memory cache for now.
8. **Random endpoint implemented locally under KAN-24.** Response `{ lat, lng }` matches the frontend's optional-name contract. Offline mask selection, route and existing API consumer tested; frontend proxy returned HTTP 200. User browser interaction and commit/PR remain. See Section 6 for coarse-mask limitations. *(Mohammed)*
9. **Where the JWT lives in the browser.** `AuthContext` keeps it in `localStorage` so Saved Locations survives reloads. Revisit when the login modal is built (localStorage is readable by any XSS; the alternative is memory-only or an httpOnly cookie). Also undecided: `GET /api/auth/google/callback` returns JSON, so the SPA needs a way to receive the token after the Google redirect. *(Aamir + Mario)*
10. **`/api/location` returns every module in one response**, so the dashboard waits on the slowest module and shows all cards at once. There is no per-module endpoint for progressive loading. Decide whether that's acceptable. *(Lance)*
11. **Google login can't finish in the browser app yet.** `GET /api/auth/google/callback` (in `backend/src/routes/auth.ts`, Aamir's file) answers with JSON, so after Google the user is left looking at raw JSON. The frontend side is ready at `/auth/callback`. Proposed backend change (Aamir to accept or adjust): on success, `res.redirect(`${env.CLIENT_URL}/auth/callback#token=${token}&user=${base64url(JSON.stringify(sanitizedUser(user)))}`)`; on failure, redirect to `/auth/callback#error=state|failed|conflict` instead of the JSON 400/401/409. The fragment (`#`) keeps the token out of server logs, and the page removes it from the address bar immediately. *(Aamir; frontend by Mario is done)*
12. **"Forgot password?" (Figma screen 05) has nothing behind it.** There's no reset endpoint, and a reset flow needs an email service plus single-use reset tokens. The link is left out of the modal until the team decides whether to build it (or drops it from the wireframe). *(Aamir for the backend; Mario adds the link)*

---

## 8. Remaining Work (not claimed yet)

Claim an item by moving it to Section 5 with your files.

- **Data modules:** air quality, astronomy (`suncalc`), space (N2YO, Launch Library 2, NOAA SWPC aurora), hazards (USGS, NWS, FIRMS, GVP), ocean (Open-Meteo Marine), static data (VIIRS, SEDAC)
- **Offline preprocessing:** `scripts/preprocess-static/` for VIIRS + SEDAC → `data/static/`
- **Middleware still empty:** `errorHandler.ts`, `validate.ts`, `rateLimit.ts` (`authenticate` / `requireRole` are done)
- **Auth leftovers:** `POST /api/auth/logout`, `GET/PUT /api/profile`
- **Optional cache pieces:** `cache/redisCache.ts` (Upstash), `lib/throttle.ts` (per-provider throttle)
- **Frontend:** module components replacing the raw-JSON placeholder (Weather, AirQuality, Astronomy, Hazards, Ocean, SkyConditions, Space), profile page (the avatar menu has no Profile link until it exists), Open-Meteo attribution on the globe page once weather data shows, favorites star in search results (there is currently no way to *add* a favorite from the UI)
- **Admin API** (no UI): manage users; enable/disable data sources
- **Deployment** (hosting TBD), production OAuth redirect URIs, and an SPA fallback so `/globe` and `/auth/callback` serve `index.html`
- **Class deliverables:** testing scenarios write-up, sprint reports

---

## 9. Change Log

> Add one line per change: `YYYY-MM-DD · Name (GitHub) · agent-assisted? · what changed`

- 2026-11-15 · Mario Sepriano (hello-world-42) · agent-assisted · Dashboard restyle to the wireframes (floating rounded card, ◀ collapsed tab, split zoom pill), landing globe redrawn with d3-geo + Natural Earth land, darker top bar with glow line, original logo restored. Added frontend deps d3-geo, topojson-client, world-atlas. Updated Sections 2.5, 4, 5, 6.

- 2026-11-15 · Mario Sepriano (hello-world-42) · agent-assisted · Added the login/register modal (Figma screen 05; wired to `/api/auth/register` + `/login`), landing page with the attribution footer (screen 01), top bar with avatar menu, and routes (`/`, `/globe`, `/auth/callback`). Google return page is ready but needs the backend redirect in Section 7 item 11; "Forgot password?" left out (item 12). Updated Sections 3.6, 4, 5, 6, 7 (items 9, 11, 12), 8.

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
