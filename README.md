# Vantage

A 3D interactive globe with live data for any spot on Earth. Click the globe, search for a place, or jump to a random location, and a dashboard shows hazards, sun and moon, rocket launches and satellite passes, and more (weather, air quality and ocean are on the way).

Team project for Software Engineering at Georgia State University.

> **Working on the code? Read [SPEC.md](SPEC.md) first.** It says who owns which files right now, how the code is organized, and what's done. Update it when you finish something.

## Requirements

- **Node.js 20.19 or newer** (22 recommended). Check with `node -v`.
- **npm** (comes with Node).
- A **Mapbox public token** to see the globe. The other keys are optional; each one only turns on the data that needs it.

## Setup

```bash
git clone https://github.com/hello-world-42/Vantage.git
cd Vantage
git checkout dev
npm install
```

Then create the `.env` file at the **repo root** (one file for backend and frontend):

```bash
cp .env.example .env          # Windows (PowerShell): Copy-Item .env.example .env
```

Fill in what you have. The minimum to see something:

| Variable | What it turns on |
|---|---|
| `VITE_MAPBOX_TOKEN` | The globe (public token, starts with `pk.`) |
| `NWS_USER_AGENT` | US severe-weather alerts. Any text that names the app and a contact, e.g. `Vantage (you@example.com)` |
| `DATABASE_URL`, `JWT_SECRET` | Login, register and saved locations. `JWT_SECRET` must be at least 32 characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login with Google |
| `N2YO_API_KEY` | Satellite passes on the space card |
| `MAPBOX_TOKEN` | Search (server-side geocoding) |

Never commit `.env`. It's git-ignored; only `.env.example` (no real values) is committed. Ask the team for the shared keys.

## Run it

```bash
npm run dev
```

This starts both servers:

- Frontend: http://localhost:5173 (open this)
- Backend: http://localhost:3000. The frontend's `/api` requests are forwarded here.

Quick checks:

- http://localhost:3000/api/health should return `{"ok":true,...}`
- http://localhost:3000/api/location?lat=33.75&lng=-84.39&country=US should return Atlanta's dashboard data

Stop with **Ctrl+C**.

## Scripts

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Backend and frontend together, reloading on changes |
| `npm run dev:backend` / `npm run dev:frontend` | Just one of them |
| `npm test` | All backend tests (no `.env` or internet needed) |
| `npm run typecheck` | TypeScript checks for every workspace, tests included |
| `npm run build` | Production build of backend and frontend |

GitHub runs `typecheck`, `test` and `build` on every pull request into `dev` or `main` ([CI workflow](.github/workflows/ci.yml)). Run them locally before you open a PR.

## How the code is organized

An npm workspaces monorepo:

- **`frontend/`**: React 19, Vite, Tailwind, Mapbox GL. Only ever calls our own `/api`, never a third-party API.
- **`backend/`**: Express. Every outside API call happens here. `GET /api/location` runs all data modules in parallel through the aggregator, with caching per 0.25° grid cell.
- **`shared/`**: TypeScript types and zod schemas used by both sides (`@vantage/shared`).
- **`scripts/preprocess-static/`**: one-time Python script that turns the light-pollution and population rasters into small grid files in `data/static/`.

To add a data module, follow "How to add a data module" in [SPEC.md](SPEC.md#5-in-progress-claimed-files-dont-touch-unless-youre-the-owner).

## Team workflow

1. Pull `dev`, then create a branch from it: `feature/<short-name>`.
2. Claim your files in SPEC.md Section 5 before you start.
3. Open a pull request into `dev`. CI must pass, and a teammate reviews it.
4. When you're done, move your item to SPEC.md Section 6 and add a Change Log line.

`main` only gets working, demo-ready code from `dev`.

## Data sources

Open-Meteo, USGS, NOAA/NWS, NASA FIRMS, N2YO, Launch Library 2 (The Space Devs), Smithsonian GVP, OpenAQ, VIIRS (Earth Observation Group), SEDAC, Mapbox, and suncalc. Each one's terms and quota are listed in [SPEC.md](SPEC.md#34-data-sources).
