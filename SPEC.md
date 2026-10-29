# VANTAGE: PROJECT SPEC

> **What this file is for.** This is the single source of truth for the Vantage project. Every teammate, and every coding agent working for a teammate, reads this file **before** making changes and updates it **after**. It says what we're building, how the code is organized, what's done, what's in progress, and **who owns which files right now**, so two people never edit the same file at the same time.

Last updated: 2026-10-27 by Lance Santiago (LanceSan04)

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
| Aamir Mohammad | (fill in) | Database and auth |
| hello-world-42 (fill in name) | hello-world-42 | Frontend: globe, dashboard, search UI, auth UI |
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
| Backend | Node (≥ 20.19), Express 4, helmet, cors, dotenv, zod 4, TypeScript (run with `tsx`) |
| Shared | `@vantage/shared` workspace package (types + zod schemas used by both sides) |
| Database | PostgreSQL on Neon |
| Auth | JWT + bcrypt, Google OAuth 2.0 |
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

### 3.3 Environment

- **One `.env` at the repo root**, shared by backend and frontend. Copy `.env.example` → `.env` and fill it in.
- The backend loads it in `backend/src/server.ts`; Vite reads it via `envDir` in `frontend/vite.config.ts`.
- Only variables starting with `VITE_` reach the browser. **Only `VITE_MAPBOX_TOKEN` (public) and `VITE_API_URL` belong there.**
- Backend port: **3000**. Frontend dev server: **5173**. The Vite proxy forwards `/api` → `localhost:3000`.

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

Three tables only. Live API data is cached, never stored in the DB. Guests aren't stored.

- **users:** `user_id` PK, `username`, `email` (unique), `password_hash`, `role` ('user' | 'admin'), `created_at`
- **favorite_locations:** `favorite_id` PK, `user_id` FK → users (cascade delete), `label`, `latitude`, `longitude`, `country`, `city`, `saved_at`
- **data_sources:** `source_id` PK, `updated_by` FK → users (nullable, set null), `name`, `category`, `is_enabled`, `last_status`, `last_checked_at`

Relationships: users 1 → 0..* favorite_locations ("saves"); users 0..1 → 0..* data_sources ("updates").

### 3.6 API endpoints (planned)

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/health` | — | ✅ Done |
| GET | `/api/geocode?q=` | — | ❌ Route missing (client exists) |
| GET | `/api/location?lat=&lng=` | — | ❌ Not started |
| GET | `/api/random` | — | ❌ Not started |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | — | ❌ Not started |
| GET | `/api/auth/google`, `/api/auth/google/callback` | — | ❌ Not started |
| GET/PUT | `/api/profile` | User | ❌ Not started |
| GET/POST/DELETE | `/api/favorites` | User | ❌ Not started |
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
│   ├── package.json             ✅ exports ./src/contract.ts and ./schemas
│   ├── tsconfig.json            ✅
│   └── src/
│       ├── contract.ts          ✅ GeocodeResult, GeocodeResponse (ModuleResult etc. still to add)
│       └── schemas.ts           ⬜ zod input schemas
│
├── backend/                     @vantage/backend
│   ├── package.json             ✅ express, helmet, cors, dotenv, zod 4, tsx
│   ├── tsconfig.json            ✅
│   └── src/
│       ├── app.ts               ✅ helmet, CORS, JSON, /api/health, 404
│       ├── server.ts            ✅ loads root .env, listen(PORT)
│       ├── config/env.ts        ⬜
│       ├── aggregator/          ⬜ aggregateLocation.ts, moduleRegistry.ts
│       ├── cache/               ⬜ cache.ts, memoryCache.ts, redisCache.ts, ttlPolicy.ts
│       ├── lib/                 ⬜ geo.ts, grid.ts, http.ts, singleflight.ts, throttle.ts
│       ├── middleware/          ⬜ authenticate, errorHandler, rateLimit, requireRole, validate
│       ├── routes/              ⬜ admin, auth, favorites, geocode, location, profile, random
│       ├── db/                  ⬜ client.ts, schema.ts, migrations/ 📁
│       └── modules/
│           ├── geo/             ✅ mapboxGeocoding.client.ts · ⬜ geo.service.ts, randomLocation.service.ts
│           ├── weather/         ⬜ openMeteo.client.ts, weather.service.ts
│           ├── airQuality/      ⬜ airQuality.service.ts, openAq.client.ts, openMeteoAirQuality.client.ts
│           ├── astronomy/       ⬜ astronomy.service.ts, astronomyApi.client.ts, suncalc.service.ts
│           ├── hazards/         ✅ nwsAlerts.client.ts (local, standalone) · ⬜ hazards.service.ts, usgsQuakes, nasaFirms, gvpVolcano clients
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
│       ├── api/client.ts        ✅ geocode() → /api/geocode
│       ├── components/
│       │   ├── Globe/Globe.tsx                  ✅
│       │   ├── Search/Search.tsx                ✅
│       │   ├── LocationPanel/LocationPanel.tsx  ✅ + layout.ts
│       │   ├── Logo.tsx                         ✅
│       │   ├── Attribution.tsx                  ⬜
│       │   ├── modules/         ⬜ ModuleCard + Weather/AirQuality/Astronomy/Hazards/Ocean/SkyConditions/Space
│       │   └── auth/, favorites/, profile/, RandomButton/, admin/   📁
│       ├── context/AuthContext.tsx   ⬜
│       └── hooks/               ⬜ useAuth.ts, useLocationData.ts
│
├── scripts/preprocess-static/   📁 offline GDAL/Python for VIIRS + SEDAC
└── data/static/                 📁 generated coarse grids
```

### Branches

| Branch | Owner | State |
|---|---|---|
| `main` | — | Initial scaffold only. Update from `dev` at milestones |
| `dev` | everyone | Integration branch. All PRs go here |
| `feature/database-setup` | Aamir | **Not merged.** Schema SQL + TS types (see Section 7) |
| `feature/globe` | hello-world-42 | Merged into `dev` |
| `person4-geocode-weather` | Mohammed | Merged into `dev` |
| `feature/workspace-scaffold` | Lance | Merged into `dev` |

### Running it

```bash
npm install
cp .env.example .env      # then fill in the keys
npm run dev               # backend :3000 + frontend :5173
```

Other scripts: `npm run dev:backend`, `npm run dev:frontend`, `npm run build`, `npm run typecheck`.

---

## 5. In Progress (claimed files: don't touch unless you're the owner)

> Format: **Owner** · branch · started · goal · exact files. Remove your entry when done and move it to Section 6.
> Entries marked *(from sprint plan, confirm)* were assigned in the sprint plan but the owner hasn't confirmed the claim yet. Owners: confirm or edit your entry.

### Lance Santiago (LanceSan04): backend core
- **Branch:** `feature/backend-core` · **Started:** 2026-10-27
- **Goal:** env validation, shared data contract, module registry/aggregator with `/api/location`, cache layer.
- **Files:**
  - `backend/src/config/env.ts`
  - `shared/src/contract.ts` (**adding** `ModuleStatus`, `ModuleResult<T>`, `ModuleId`, `LocationResponse`, `WeatherData`; existing geocode types stay)
  - `shared/src/schemas.ts`
  - `backend/src/aggregator/moduleRegistry.ts`, `backend/src/aggregator/aggregateLocation.ts`
  - `backend/src/routes/location.ts`
  - `backend/src/lib/grid.ts`, `backend/src/lib/singleflight.ts`, `backend/src/lib/http.ts`
  - `backend/src/cache/cache.ts`, `backend/src/cache/memoryCache.ts`, `backend/src/cache/ttlPolicy.ts`
  - `backend/src/app.ts` (mounting routes only)
  - `README.md`

### Aamir Mohammad: database and auth *(from sprint plan, confirm)*
- **Branch:** `feature/database-setup` · **Started:** 2026-10-15
- **Goal:** finish and merge the schema, then the auth routes.
- **Files:**
  - `backend/src/db/migrations/001_initial_schema.sql`, `backend/src/db/migrations/002_seed_data_sources.sql`
  - `backend/src/db/schema.ts`, `backend/src/db/client.ts`
  - Next: `backend/src/routes/auth.ts`, `backend/src/routes/profile.ts`, `backend/src/routes/favorites.ts`, `backend/src/middleware/authenticate.ts`, `backend/src/middleware/requireRole.ts`

### Mohammed Hussain Shareef Shaik: geocoding and weather *(from sprint plan, confirm)*
- **Branch:** `person4-geocode-weather` (or a new `feature/...` from `dev`)
- **Goal:** make search work end to end, then the weather module.
- **Files:**
  - `backend/src/modules/geo/mapboxGeocoding.client.ts` (fix return shape, see Section 7)
  - `backend/src/modules/geo/geo.service.ts`
  - `backend/src/routes/geocode.ts`
  - `backend/src/modules/weather/openMeteo.client.ts`, `backend/src/modules/weather/weather.service.ts`
  - Next: `backend/src/modules/geo/randomLocation.service.ts`, `backend/src/routes/random.ts`, hazards module files

### hello-world-42: frontend dashboard *(from sprint plan, confirm)*
- **Branch:** create a `feature/...` from `dev`
- **Goal:** dashboard contents (ModuleCard, default state, Random button, Saved Locations), then the auth modal and landing page.
- **Files:**
  - `frontend/src/components/Globe/Globe.tsx`, `frontend/src/components/Search/Search.tsx`, `frontend/src/components/LocationPanel/*`, `frontend/src/App.tsx`
  - `frontend/src/components/modules/*`
  - `frontend/src/components/RandomButton/*`, `frontend/src/components/favorites/*`
  - `frontend/src/hooks/useLocationData.ts`, `frontend/src/api/client.ts`
  - Next: `frontend/src/components/auth/*`, `frontend/src/context/AuthContext.tsx`, `frontend/src/hooks/useAuth.ts`

---

## 6. Completed

### Standalone NWS client completed locally on 2026-10-29

- **Owner:** Mohammed Hussain Shareef Shaik (GitHub username not supplied; agent-assisted).
- **Branch:** `feature/nws-alerts-client`. Local work only; not committed, pushed, or merged.
- **Files:** `backend/src/modules/hazards/nwsAlerts.client.ts`, `backend/tests/nwsAlerts.client.test.ts`.
- **Handoff:** call `fetchNwsAlerts({ lat, lng, countryCode }, { userAgent })` with an explicit ISO country code and configured User-Agent supplied by the caller. This client never loads environment files or reads `process.env`. The current scope is country code `US`; other country codes return `not_applicable` without a request. Do not infer US coverage using a rectangular coordinate boundary.
- **Output:** provider result `{ status: 'ok', source: 'NWS', alerts }` (an empty list means no active alerts) or `{ status: 'not_applicable', source: 'NWS', reason }`. Failures throw `NwsClientError` with `code` and an optional HTTP `status`; upstream bodies and caller contact details are not included in errors.
- **Integration remains with Lance:** wrap provider results/errors in the final shared `ModuleResult`, register the provider and add caching. No aggregator, registry, shared contract, route, or hazards service was changed for this task.
- **Checks:** 12 tests passed; workspace typechecks, backend build, and test typecheck passed. A live Atlanta request succeeded with zero active alerts using a non-secret validation User-Agent. Run tests from the repo root with `node --import tsx --test backend/tests/nwsAlerts.client.test.ts`.

| Date | Who | What | Key files |
|---|---|---|---|
| 2026-09-29 | Lance | Initial repo + folder skeleton | all placeholder files |
| 2026-10-08 | Lance | Wireframes (7 screens, Figma) | Figma file |
| 2026-10-15 | Lance | API accounts (shared team email) + `.env.example` | `.env.example` |
| 2026-10-15 | hello-world-42 | Mapbox globe, search UI, dashboard panel shell, API client, frontend workspace | `frontend/**`, `shared/src/contract.ts` |
| 2026-10-15 | Mohammed | Mapbox forward geocoding client | `backend/src/modules/geo/mapboxGeocoding.client.ts` |
| 2026-10-15 | Aamir | DB schema + TS types (**on unmerged branch**) | `backend/src/db/**` on `feature/database-setup` |
| 2026-10-27 | Lance | npm workspaces, Express app with `/api/health`, root `npm run dev`, `.gitignore`; merged with `dev` | `package.json`, `tsconfig.base.json`, `backend/**`, `.gitignore` |
| 2026-10-27 | hello-world-42 | Globe height fix; single root `.env` (Vite `envDir`); proxy → 3000 | `Globe.tsx`, `vite.config.ts` |
| 2026-10-27 | Lance | Backend loads root `.env`; zod upgraded to v4 (security fix); removed `jobs/` | `backend/src/server.ts`, `backend/package.json`, `.env.example` |

---

## 7. Known Issues / Decisions Needed

1. **Geocode shape mismatch.** `mapboxGeocoding.client.ts` returns `{ id, name, latitude, longitude }`, but the frontend expects the shared `GeocodeResult` `{ id, name, context?, lat, lng }`. The client should return `GeocodeResult` from `@vantage/shared`. *(Mohammed)*
2. **`/api/geocode` route doesn't exist**, so search can't return results yet. *(Mohammed)*
3. **`password_hash` is `NOT NULL`** in the schema, but Google sign-in users have no password. Make it nullable (or add an `auth_provider` column). *(Aamir)*
4. **`002_seed_data_sources.sql` is empty.** It should insert one row per data source. *(Aamir)*
5. **`feature/database-setup` isn't merged** and its `.gitignore` will conflict with `dev`. Merge `dev` into it first, keeping `dev`'s `.gitignore`. *(Aamir)*
6. **No request timeout** in the geocoding client yet. Switch to `lib/http.ts` once it exists. *(Mohammed, after Lance's `http.ts`)*
7. **Vite bundle > 500 kB** (Mapbox). Expected; not a problem for now.

---

## 8. Remaining Work (not claimed yet)

Claim an item by moving it to Section 5 with your files.

- **Data modules:** air quality, astronomy (`suncalc`), space (N2YO, Launch Library 2, NOAA SWPC aurora), hazards (USGS, NWS, FIRMS, GVP), ocean (Open-Meteo Marine), static data (VIIRS, SEDAC)
- **Offline preprocessing:** `scripts/preprocess-static/` for VIIRS + SEDAC → `data/static/`
- **Middleware:** `errorHandler.ts`, `validate.ts`, `rateLimit.ts`
- **Optional cache pieces:** `cache/redisCache.ts` (Upstash), `lib/throttle.ts` (per-provider throttle)
- **Frontend:** landing page, login/register modal (with Google), profile page, `Attribution.tsx`, favorites star in search results
- **Admin API** (no UI): manage users, enable/disable data sources
- **Deployment** (hosting TBD) and production OAuth redirect URIs
- **Class deliverables:** testing scenarios write-up, sprint reports

---

## 9. Change Log

> Add one line per change: `YYYY-MM-DD · Name (GitHub) · agent-assisted? · what changed`

- 2026-10-29 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented and tested the standalone NWS point-alert client on `feature/nws-alerts-client`; explicit User-Agent/country inputs, no environment-file access, no aggregation integration. Local only, not committed or pushed.

- 2026-10-27 · Lance Santiago (LanceSan04) · agent-assisted · Created SPEC.md from the current `dev` branch, sprint plan and design decisions.
