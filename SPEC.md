# VANTAGE: PROJECT SPEC

> **What this file is for.** This is the single source of truth for the Vantage project. Every teammate, and every coding agent working for a teammate, reads this file **before** making changes and updates it **after**. It says what we're building, how the code is organized, what's done, what's in progress, and **who owns which files right now**, so two people never edit the same file at the same time.

Last updated: 2026-10-29 by Aamir Mohammad (amohammad12)

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
| GET | `/api/geocode?q=` | — | ❌ Route missing (client exists) |
| GET | `/api/location?lat=&lng=[&country=]` | — | ✅ Done (hazards module only: NWS alerts) |
| GET | `/api/random` | — | ❌ Not started |
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
│       ├── routes/              ✅ location.ts, auth.ts, favorites.ts (+ tests) · ⬜ admin, geocode, profile, random
│       ├── db/                  ✅ client.ts, schema.ts, migrations/001_initial_schema.sql, 002_seed_data_sources.sql, 003_google_oauth.sql (+ tests)
│       └── modules/
│           ├── geo/             ✅ mapboxGeocoding.client.ts · ⬜ geo.service.ts, randomLocation.service.ts
│           ├── weather/         ⬜ openMeteo.client.ts, weather.service.ts
│           ├── airQuality/      ⬜ airQuality.service.ts, openAq.client.ts, openMeteoAirQuality.client.ts
│           ├── astronomy/       ⬜ astronomy.service.ts, astronomyApi.client.ts, suncalc.service.ts
│           ├── hazards/         ✅ nwsAlerts.client.ts (registered as the hazards module) · ⬜ hazards.service.ts, usgsQuakes, nasaFirms, gvpVolcano clients
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
| `dev` | everyone | Integration branch. All PRs go here. At `37e9abb`: database, auth, aggregator, NWS hazards, globe, geocoding client |
| `feature/database-setup` | Aamir | **Merged** into `dev` (PR #1) |
| `feature/auth` | Aamir | **Merged** into `dev` (PR #5) |
| `feature/nws-alerts-client` | Mohammed | **Merged** into `dev` (PR #4) |
| `feature/globe` | hello-world-42 | Merged into `dev` |
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

| Date | Who | What | Key files |
|---|---|---|---|
| 2026-09-29 | Lance | Initial repo + folder skeleton | all placeholder files |
| 2026-10-08 | Lance | Wireframes (7 screens, Figma) | Figma file |
| 2026-10-15 | Lance | API accounts (shared team email) + `.env.example` | `.env.example` |
| 2026-10-15 | hello-world-42 | Mapbox globe, search UI, dashboard panel shell, API client, frontend workspace | `frontend/**`, `shared/src/contract.ts` |
| 2026-10-15 | Mohammed | Mapbox forward geocoding client | `backend/src/modules/geo/mapboxGeocoding.client.ts` |
| 2026-10-15 | Aamir | Neon schema SQL + TS types (later merged) | `backend/src/db/migrations/001_initial_schema.sql`, `backend/src/db/schema.ts` |
| 2026-10-27 | Lance | npm workspaces, Express app with `/api/health`, root `npm run dev`, `.gitignore`; merged with `dev` | `package.json`, `tsconfig.base.json`, `backend/**`, `.gitignore` |
| 2026-10-27 | hello-world-42 | Globe height fix; single root `.env` (Vite `envDir`); proxy → 3000 | `Globe.tsx`, `vite.config.ts` |
| 2026-10-27 | Lance | Backend loads root `.env`; zod upgraded to v4 (security fix); removed `jobs/` | `backend/src/server.ts`, `backend/package.json`, `.env.example` |
| 2026-10-29 | Mohammed | NWS alerts client + 12 tests | `backend/src/modules/hazards/nwsAlerts.client.ts`, `backend/tests/nwsAlerts.client.test.ts` |
| 2026-10-29 | Lance | Backend core: shared ModuleResult contract + zod schemas, env validation, grid snapping, memory cache + TTL policy, singleflight, module registry (NWS as hazards), aggregator, `GET /api/location`, 17 tests | `shared/src/contract.ts`, `shared/src/schemas.ts`, `shared/package.json`, `backend/src/config/env.ts`, `backend/src/lib/grid.ts`, `backend/src/lib/singleflight.ts`, `backend/src/cache/cache.ts`, `backend/src/cache/memoryCache.ts`, `backend/src/cache/ttlPolicy.ts`, `backend/src/aggregator/*`, `backend/src/routes/location.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/tests/{aggregator,cache,grid,location.route}.test.ts` |
| 2026-10-29 | Aamir | Neon pool, migrations 001–003, six seeded data sources, email/password auth, JWT + role middleware, Google OAuth, protected Favorites API | `backend/src/db/**`, `backend/src/auth/**`, `backend/src/middleware/authenticate.ts`, `backend/src/middleware/requireRole.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/favorites.ts` |

---

## 7. Known Issues / Decisions Needed

**Resolved (Sprint 2):**
- **`password_hash` is nullable for Google users.** Migration `003_google_oauth.sql` drops `NOT NULL`, adds unique `google_sub`, and requires at least one auth method. *(Aamir)*
- **`002_seed_data_sources.sql` seeds six providers** (Open-Meteo, USGS, NWS, NOAA SWPC, N2YO, Launch Library 2) and is safe to rerun. *(Aamir)*
- **`feature/database-setup` is merged** into `dev` (PR #1), after merging `dev` in and keeping `dev`'s `.gitignore`. `feature/auth` is also merged (PR #5). *(Aamir)*

**Open:**

1. **Geocode shape mismatch.** `mapboxGeocoding.client.ts` returns `{ id, name, latitude, longitude }`, but the frontend expects the shared `GeocodeResult` `{ id, name, context?, lat, lng }`. The client should return `GeocodeResult` from `@vantage/shared`. *(Mohammed)*
2. **`/api/geocode` route doesn't exist**, so search can't return results yet. *(Mohammed)*
3. **No request timeout** in the geocoding client yet. Switch to `lib/http.ts` once it exists. *(Mohammed, after Lance's `http.ts`)*
4. **Vite bundle > 500 kB** (Mapbox). Expected; not a problem for now.
5. **No reverse geocoding yet, so the backend doesn't know a point's country.** NWS (US-only) needs it. Until then, `/api/location` accepts `?country=US`, and without it the hazards module returns `not_applicable`. Fix: add `reverseGeocode(lat, lng)` → ISO country code in `backend/src/modules/geo/`, then pass it as `resolveCountry` to `createAggregator` in `app.ts`. *(Mohammed for the client; Lance wires it in)*
6. **`data_sources` check isn't wired yet.** The table is seeded, but the aggregator still defaults to "all enabled". It already accepts `isEnabled(id)`; once wired it should read `data_sources.is_enabled`. *(Aamir + Lance)*
7. **`CACHE_DRIVER=redis` isn't implemented**; the app always uses the memory cache for now.

---

## 8. Remaining Work (not claimed yet)

Claim an item by moving it to Section 5 with your files.

- **Data modules:** air quality, astronomy (`suncalc`), space (N2YO, Launch Library 2, NOAA SWPC aurora), hazards (USGS, NWS, FIRMS, GVP), ocean (Open-Meteo Marine), static data (VIIRS, SEDAC)
- **Offline preprocessing:** `scripts/preprocess-static/` for VIIRS + SEDAC → `data/static/`
- **Middleware still empty:** `errorHandler.ts`, `validate.ts`, `rateLimit.ts` (`authenticate` / `requireRole` are done)
- **Auth leftovers:** `POST /api/auth/logout`, `GET/PUT /api/profile`
- **Optional cache pieces:** `cache/redisCache.ts` (Upstash), `lib/throttle.ts` (per-provider throttle)
- **Frontend:** landing page, login/register modal (with Google), profile page, `Attribution.tsx`, favorites star in search results
- **Admin API** (no UI): manage users; enable/disable data sources
- **Deployment** (hosting TBD) and production OAuth redirect URIs
- **Class deliverables:** testing scenarios write-up, sprint reports

---

## 9. Change Log

> Add one line per change: `YYYY-MM-DD · Name (GitHub) · agent-assisted? · what changed`

- 2026-10-29 · Aamir Mohammad (amohammad12) · agent-assisted · Updated SPEC.md to match `dev` at `37e9abb`: filled in GitHub username, documented merged database/auth/OAuth/favorites work, Lance's aggregator/cache/contract/location API, endpoint and branch statuses, remaining profile/logout/admin work, and resolved known issues 3–5.

- 2026-10-29 · Aamir Mohammad (amohammad12) · agent-assisted · Implemented Neon PostgreSQL (schema, pool, migrations 001–003, six seeded data sources), email/password auth (bcrypt + JWT), authenticate/requireRole middleware, Google OAuth (PKCE + `003_google_oauth.sql`), and the protected Favorites API; merged to `dev` via PRs #1 and #5.

- 2026-10-29 · Lance Santiago (LanceSan04) · agent-assisted · Built backend core (contract, schemas, env, grid, cache, singleflight, registry, aggregator, `/api/location`) with 17 tests; registered Mohammed's NWS client as the hazards module; updated Sections 3.6, 4, 5, 6, 7. Corrected the NWS entry: it was pushed, not local-only.

- 2026-10-29 · Mohammed Hussain Shareef Shaik (GitHub username not supplied) · agent-assisted · Implemented and tested the standalone NWS point-alert client on `feature/nws-alerts-client`; explicit User-Agent/country inputs, no environment-file access, no aggregation integration.

- 2026-10-27 · Lance Santiago (LanceSan04) · agent-assisted · Created SPEC.md from the current `dev` branch, sprint plan and design decisions.
