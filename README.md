# Fault Line: A Live Seismic Operations Command

A full-stack ops-center dashboard for a shared, persistent world: you manage a portfolio of six real cities sitting on six genuinely different real fault systems, and the **only clock driving the core loop is the live USGS Earthquake Hazards Program feed**: there is no simulated RNG anywhere in this game. When a real earthquake resolves against one of your sites, the outcome is computed from a real attenuation model and written permanently to an append-only historical ledger. It can never be undone, replayed, or reset. This is deliberately **one shared server-side world, not a per-browser session**: refreshing the page, or opening it on a different device, shows the same ongoing history, because it's tracking one real, ongoing thing, not a resettable game.

Built with React, TypeScript, Express, and the same live USGS GeoJSON feed the project has used since its first iteration, a sibling project to [Petrichor](../Petrichor), but a deliberate visual and conceptual departure from it (see "UI Direction" below).

> This project went through two prior full builds as a real-time audio-sonification engine (Tone.js synthesis reacting to earthquake data) before this pivot. The audio-sonification premise has been fully retired: there is no audio anywhere in this codebase anymore. What's kept from that era is the *domain math*: the Omori-Utsu aftershock decay law, the magnitude-energy scaling, and the tectonic-region classifier all transferred over, repurposed for a genuinely different mechanic instead of being thrown away.

---

## Disclaimer

**This is not an early-warning system, a seismic hazard tool, or a safety-critical application of any kind, and it makes no claims to that effect.** The attenuation/damage model is a deliberately simplified approximation, not a real ShakeMap. The recurrence intervals and "last major rupture" years for each site are rough, rounded figures assembled from public seismology summaries for a hobby project, not authoritative hazard data, and several of them carry real, acknowledged uncertainty. Nothing in this app predicts, forecasts with any real accuracy, or provides guidance for real-world safety decisions. See "Honest Limitations" below for the specifics.

---

## The Premise

You operate a live seismic-risk desk. Six real cities are on the board, each on a distinct real fault system:

| Site | Fault System | Recurrence (rough) | Last major rupture (rough) |
|------|--------------|---------------------|------------------------------|
| San Francisco, USA | San Andreas Fault (transform) | ~200 years | ~1906 |
| Tokyo, Japan | Sagami Trough / Nankai-Suruga subduction | ~200 years | ~1923 |
| Istanbul, Turkiye | North Anatolian Fault | ~250 years | ~1766 |
| Kathmandu, Nepal | Main Frontal Thrust (Himalayan collision) | ~500 years | ~1934 |
| Santiago, Chile | Peru-Chile Trench (Nazca subduction) | ~150 years | ~2010 |
| Wellington, New Zealand | Hikurangi subduction margin | ~500 years | ~1820 (least certain) |

The live feed is real. Every quake it reports is checked against every site's real coordinates; a strong-enough, close-enough quake computes real damage and writes a permanent ledger entry. Nothing here waits for you, and nothing here can be replayed.

### Core systems

1. **Portfolio of real sites** (`server/src/lib/sites.js`): coordinates, fault-system name, recurrence interval, and last-major-rupture year for each of the six sites above.
2. **Real attenuation damage model** (`server/src/lib/damageModel.js`): haversine distance from quake to site, a simplified MMI-like shaking-intensity estimate from magnitude/depth/distance, and damage scaled down (never to zero) by the site's current resilience. Pure, unit-tested functions.
3. **Resilience budget with real-time regen**: a single shared budget (starts at 100, cap 100) that regenerates `+1/hour` of real wall-clock time, server-tracked (`server/src/lib/worldStore.js`, `worldEngine.js`). You spend it to raise a site's resilience (0-100), and because it only regenerates in real time, every allocation is a genuine opportunity cost.
4. **Omori-Utsu + Gutenberg-Richter aftershock decision window**: when a live mainshock crosses M6 (or a high USGS `sig`), a ~75-second real-time decision window opens. `client/src/seismology/omoriAftershocks.ts` computes a live, continuously-updating probability of a damaging aftershock by integrating the real Omori-Utsu decay law over a forecast horizon and combining it with the Gutenberg-Richter magnitude-frequency relation (a simplified Reasenberg-Jones-style combination). The Gutenberg-Richter b-value feeding that isn't a fixed constant: `estimateBValue` fits it live, via Aki's (1965) maximum-likelihood estimator with Utsu's (1965) half-bin correction, against whatever magnitudes are actually streaming in through the global feed right now, falling back to a textbook default when there isn't yet enough qualifying data (or when the live estimate falls outside a real-world-plausible range) to trust the fit. You can commit available resilience budget to a site's emergency response before the window closes; whatever you decide (or don't) locks permanently into the ledger.
5. **Seismic-gap overdue-pressure gauge** (`server/src/lib/overduePressure.js`): (years since last major rupture) / (recurrence interval) for every site, shown continuously. This is purely informational; it never triggers anything itself, since there's no simulated RNG in the core loop. It exists so you can strategically pre-invest resilience in a site that's statistically overdue even though nothing has happened there yet.
6. **Global intelligence log with rarity scoring** (`client/src/seismology/rarityScore.ts`): every real quake globally (not just ones touching your sites) streams into a scrolling log, each tagged with an objective rarity score from real magnitude/depth frequency relationships (bigger and/or anomalously deep events score higher, via a Gutenberg-Richter-style magnitude multiplier and a global depth-band frequency multiplier) plus a small deterministic glyph (`client/src/seismology/glyph.ts`) generated from the event's own stats.
7. **Permanent Ledger view**: a second tab (alongside the main Operations dashboard) paging through every ledger entry ever written, newest first, filterable by site (`client/src/components/LedgerView.tsx`, `client/src/inputs/useLedgerPage.ts`, `server/src/lib/ledgerPagination.js`). This is where the "permanent, unresettable" premise actually becomes something you can browse, not just a claim about the API response. `GET /api/world` itself only reports a `ledgerCount`; the full history is paged on demand through `GET /api/world/ledger`, cursor-based so a page never shifts under you as new entries land.
8. **Site history drill-down**: a "History" button on each site card opens a modal (`client/src/components/SiteDetailModal.tsx`) with that site's full stats plus its own filtered ledger entries. A real modal with a real focus trap (Tab/Shift+Tab cycle inside it, Escape closes, focus returns to whatever opened it).
9. **Most-overdue callout** (`client/src/lib/overdueRanking.ts`): the Site Status header surfaces whichever site currently has the highest seismic-gap pressure, clickable to jump straight to it on the map, so you don't have to compare six cards by eye.

---

## UI Direction: Sci-Fi Operations Command

This is a deliberate departure from both [Petrichor](../Petrichor)'s and a planned sibling "ISS orbital drone" project's visual language: a single full-viewport ambient world map with a soft glassmorphism card floating over it. Fault Line instead reads as a **NORAD/mission-control HUD**: multiple panels simultaneously visible at all times (a global threat-board map, a site-status grid, a scrolling intelligence log, and an aftershock decision console that visibly lights up only when a window is open); nothing is hidden behind a single icon that reveals a slide-out drawer. Warm ochre/amber lines on a warm near-black (this is an earth-science project, not a sci-fi bridge, so the palette leans brown/earth-toned rather than the cooler cyan the first pass of this UI shipped with), monospace type, a radar-sweep motif on the threat board, sharp panel edges rather than rounded glass cards, and a glitch-style flash when a new event lands in the intelligence log.

---

## Data Source

Real-time GeoJSON summary feeds from the [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/): free, no API key, updated roughly every minute:

```
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson
```

The server polls `all_day` by default (`USGS_FEED` env var to override). The world engine and the `/api/quakes` proxy share one in-memory cache (`server/src/lib/usgsFeed.js`) with a 35-second TTL, comfortably under USGS's own ~60-second update cadence.

**World processing happens lazily, on read** (`GET /api/world`), not via a background daemon: every time the endpoint is hit, the server regenerates the resilience budget from elapsed wall-clock time, finalizes any expired aftershock decision window into the ledger, and ingests any not-yet-seen live quakes against the site portfolio. This is simple and correct in the same sense the budget regen is: it's always computed from real time, whenever someone happens to look, but it does mean ingestion pauses while nobody is polling the app. See Honest Limitations.

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend Framework** | React 18 + TypeScript | Vite dev server + build, strict TS config, `<StrictMode>` enabled (safe now, no live audio graph to double-invoke effects against) |
| **State** | React hooks + polling | `useQuakeFeed` (global feed), `useWorldState` (shared server world); no external state library needed |
| **Map** | `world-atlas` (land-110m TopoJSON) + `topojson-client` | Real cartography, bundled data, no external map-tile API/key, restyled as a tactical threat board, not an ambient hero |
| **Backend Framework** | Express (Node.js, ESM) | USGS proxy + cache, world/ledger persistence + processing, static hosting |
| **Quake Data** | USGS Earthquake Hazards Program | Free, keyless real-time GeoJSON feeds |
| **Persistence** | Flat JSON file (`server/data/world.json`) | Single shared world, no database, no auth |
| **Testing** | Vitest + Supertest | Pure-logic unit tests (client + server) and HTTP-level route tests (server) |
| **Dev Orchestration** | `concurrently` + `cross-env` | Runs client + server dev servers with one `npm run dev` |

**Tone.js is gone.** The entire audio-synthesis layer (`AudioEngine`, `seismicTheory`, P/S wave audio-arrival timing, the recorder, the Media Session lock-screen hook, and Screen Wake Lock) has been removed along with it; none of it applies to a non-audio ops dashboard.

---

## Prerequisites

- **Node.js 18+**: [Download here](https://nodejs.org/) (needs global `fetch`)

No API keys, no database, no Docker required.

---

## Quick Start

```bash
npm run install:all   # installs root, server, and client dependencies
npm run dev            # runs API on :3002 and Vite dev server on :5274 (proxies /api)
```

Open `http://localhost:5274`.

### Production

```bash
npm run build   # builds the client into client/dist
npm start        # Express serves the API + the built client on :5274 (one process, one port)
```

### Tests

```bash
npm test   # runs the server suite (Vitest + Supertest), then the client suite (Vitest)
```

---

## Project Structure

```
fault-line/
├── README.md
├── LICENSE
├── package.json                    # root dev orchestration (concurrently) + test runner
│
├── server/
│   ├── package.json
│   ├── vitest.config.js
│   ├── data/world.json             # shared world/ledger store (gitignored, created at runtime)
│   ├── test/
│   │   ├── health.test.js
│   │   ├── quakes.test.js          # mocked USGS fetch, cache behavior
│   │   ├── damageModel.test.js     # haversine, attenuation, damage math
│   │   ├── overduePressure.test.js
│   │   ├── ledgerPagination.test.js # cursor pagination: tie-breaking, hasMore, cursor continuation, limit clamping
│   │   └── world.test.js           # Supertest against /api/world*, mocked fetch
│   └── src/
│       ├── app.js                  # createApp(): Express app (importable by tests)
│       ├── index.js                # createApp().listen(...)
│       ├── lib/
│       │   ├── usgsFeed.js         # shared USGS fetch + normalize + cache
│       │   ├── sites.js            # the curated 6-site portfolio (real coords + fault data)
│       │   ├── damageModel.js      # haversine, attenuation/intensity, damage-vs-resilience
│       │   ├── overduePressure.js  # seismic-gap overdue-pressure calc
│       │   ├── worldStore.js       # flat-JSON persistence, WORLD_DATA_FILE override
│       │   ├── worldEngine.js      # budget regen, quake ingestion, aftershock windows, ledger
│       │   └── ledgerPagination.js # cursor-based pagination + site filtering over the permanent ledger
│       └── routes/
│           ├── quakes.js           # USGS proxy
│           └── world.js            # GET /api/world, /api/world/ledger, allocate, commit-aftershock-response
│
└── client/
    ├── package.json
    ├── vite.config.ts              # dev proxy: /api → :3002
    ├── vitest.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── public/
    │   ├── manifest.webmanifest
    │   ├── sw.js                    # app-shell service worker (never caches /api/*)
    │   └── icon.svg, icon-192.png, icon-512.png
    └── src/
        ├── main.tsx
        ├── App.tsx                  # wires world state + quake feed into the HUD panels
        ├── App.css                  # the sci-fi ops-center visual language
        ├── types.ts
        ├── seismology/
        │   ├── energyMapping.ts      # magnitude→energy scaling, depth bands (kept from the audio build)
        │   ├── unrestIndex.ts        # decayed-energy accumulator, repurposed as "Global Activity" HUD readout
        │   ├── omoriAftershocks.ts   # repurposed: Omori-Utsu + Gutenberg-Richter aftershock probability forecast; estimateBValue fits the b-value live (Aki/Utsu MLE) instead of using a fixed constant
        │   ├── tectonicRegion.ts     # coarse bounding-box tectonic-province classifier
        │   ├── regionDominance.ts    # per-region decayed energy + "dominant region" HUD readout
        │   ├── rarityScore.ts        # objective statistical rarity scoring for the intel log
        │   └── glyph.ts              # deterministic per-event waveform glyph
        ├── map/
        │   ├── projection.ts         # equirectangular projection (pure), reused by the threat board
        │   ├── panZoom.ts            # pure screen<->world fit/zoom/pan-clamp math (cover-fit, always fills the panel, crops overflow rather than letterboxing, zoom-around-cursor, pan clamping)
        │   └── dragState.ts          # pure drag-state reducer: distinguishes a click from a pan/drag release
        ├── inputs/
        │   ├── useQuakeFeed.ts       # polls the server's USGS proxy
        │   ├── useWorldState.ts      # polls the shared server world snapshot (sites, budget, ledgerCount)
        │   └── useLedgerPage.ts      # pages through GET /api/world/ledger for one site filter (or all)
        ├── lib/
        │   ├── formatTime.ts         # clock + "time ago" formatting
        │   └── overdueRanking.ts     # rank/pick sites by overdue pressure
        └── components/
            ├── ThreatBoard.tsx       # tactical world map: land silhouette, sites, recent quakes, radar sweep; draggable to pan, scroll/pinch to zoom, fits any panel size without distorting geography
            ├── SiteGrid.tsx          # one tile per site: resilience/health/overdue gauges + allocate control + most-overdue callout
            ├── IntelLog.tsx          # scrolling global event log with rarity + glyph
            ├── AftershockConsole.tsx # full-width banner, lights up only while a decision window is open
            ├── LedgerView.tsx        # Permanent Ledger tab: every entry, filterable by site
            ├── LedgerEntryRow.tsx    # shared per-entry-type rendering (used by LedgerView and SiteDetailModal)
            ├── SiteDetailModal.tsx   # site history drill-down; a real modal with a real focus trap
            └── ErrorBoundary.tsx     # top-level render-error fallback
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/quakes` | Normalized recent quakes from the cached USGS feed |
| GET | `/api/world` | Runs a processing pass (budget regen, window finalization, quake ingestion) and returns the world snapshot: sites + budget + `ledgerCount` + active aftershock window (not the full ledger; see below) |
| GET | `/api/world/ledger` | Cursor-paginated permanent ledger. Query params: `siteId` (optional filter), `cursor` (from a previous response's `nextCursor`), `limit` (default 25, max 100). Returns `{ entries, hasMore, nextCursor, totalMatching }` |
| POST | `/api/world/allocate` | `{ siteId, amount }`: spend resilience budget to raise a site's resilience |
| POST | `/api/world/commit-aftershock-response` | `{ siteId, amount }`: commit budget to a site during an open aftershock decision window |

---

## Configuration

| Variable | Default | Description |
|----------|---------|--------------|
| `PORT` | `5274` | Server port (overridden to `3002` by `npm run dev` for the API process) |
| `USGS_FEED` | `all_day` | Which USGS summary feed to poll |
| `WORLD_DATA_FILE` | `server/data/world.json` | Overrides the world/ledger store path, used by the test suite to isolate test data |

---

## Architecture

```
                ┌────────────────────────────────┐
                │   React + Vite (Port 5274)     │
                │   Threat board / site grid /    │
                │   intel log / aftershock console │
                │   quake feed + world-state polling│
                └──────────────┬───────────────────┘
                               │ REST (/api/*)
                ┌──────────────▼───────────────────┐
                │   Express (Port 3002)              │
                │   USGS feed proxy + cache            │
                │   world engine: budget regen,          │
                │   quake ingestion → damage → ledger,    │
                │   aftershock window open/finalize        │
                └──────┬─────────────┬─────────────────────┘
                       │             │
              ┌────────▼───┐   ┌─────▼──────────┐
              │ USGS feed   │   │ world.json      │
              │ (quakes)    │   │ (shared, append-│
              │             │   │  only ledger)   │
              └─────────────┘   └─────────────────┘
```

---

## Testing

```bash
npm test                         # both suites, from the repo root
npm test --prefix server         # Vitest + Supertest: health/quakes/world routes + pure math
npm test --prefix client         # Vitest: seismology math, rarity/glyph, projection, formatTime
```

Every pure/deterministic function in this codebase has a real Vitest unit test: the damage/attenuation model, the overdue-pressure calc, the rarity scoring, the repurposed Omori-Utsu/Gutenberg-Richter probability math, the live b-value estimator (including a synthetic-catalog test that verifies it actually recovers a known true b-value, not just that it returns some number), the energy/magnitude scaling, haversine distance, the tectonic-region classifier, the equirectangular projection and pan/zoom/drag-state math behind the threat board's map, the overdue-ranking logic behind the most-overdue callout, and the ledger's cursor-pagination logic (tie-breaking when entries share a timestamp, cursor continuation, limit clamping). The world/ledger routes are covered with Supertest, with `fetch` mocked to simulate specific live-quake scenarios (a strong quake near a site, a distant weak one, a magnitude-6+ mainshock opening and later expiring an aftershock decision window, a burst of concurrent requests) and an isolated `WORLD_DATA_FILE` per test so runs never touch real data or each other. The stateful polling hooks and DOM-heavy map/log/console rendering are exercised by manual/browser testing rather than unit tests, same testing philosophy as before: the pure math each one is built on is fully unit-tested even though the rendering shell isn't.

---

## Honest Limitations

- **This is not an early-warning, hazard-forecasting, or safety tool of any kind.** No claim is made or implied about predicting real earthquakes, real aftershocks, or informing real-world safety decisions.
- **The recurrence intervals and "last major rupture" years are rough, rounded public estimates, not authoritative hazard data.** They were assembled from public seismology summaries for a hobby project. Several carry real, acknowledged uncertainty; Wellington/Hikurangi's in particular is little more than an order-of-magnitude placeholder, since no confirmed great full-margin rupture exists in the ~200-year written record for that segment. See the notes on each site in `server/src/lib/sites.js`.
- **The attenuation/damage model is a deliberately simplified approximation, not a real ShakeMap or region-calibrated GMICE.** It's loosely shaped like published intensity-attenuation relations (magnitude up, log-distance down), with hand-picked coefficients tuned only to feel reasonable, not fit to any real region's ground-motion data.
- **The Omori-Utsu/Gutenberg-Richter aftershock forecast is illustrative, not a real forecast.** The productivity constant (K) is still a reasonable textbook default, not fit to any specific real aftershock sequence, and that's a hard structural limit here, not a to-do: a live decision window is only ~75 real seconds, nowhere near enough of an actual sequence to fit K against (USGS's own generic model makes the same call for the same reason, before enough sequence-specific data exists). The b-value is different: `estimateBValue` is a genuine live fit (Aki 1965's maximum-likelihood method) against the real global feed, not a fixed constant, but it's still a *global* estimate pooling every region's background seismicity together, not a properly localized b-value for the specific aftershock zone the way a real regional forecast would use; real forecasting tools (e.g. USGS's own aftershock forecasts) are calibrated against the actual local sequence as it unfolds.
- **The tectonic-region classifier is coarse.** It buckets coordinates with a handful of rectangular bounding boxes, not actual plate-boundary geometry.
- **This is a single shared world with no authentication.** Anyone who can reach the server can spend the shared resilience budget or commit an aftershock response; there are no accounts, no per-user state, and no access control. That's a deliberate simplicity choice for a hobby project, not a production posture.
- **World processing is lazy, not continuous.** The server ingests new quakes and finalizes aftershock windows only when `GET /api/world` is called, not via a background worker; if nobody has the app open for a while, ingestion simply catches up (correctly, since everything is computed from real timestamps) the next time someone does.
- **The rarity score is a rough Gutenberg-Richter-style statistical estimate, not a calibrated catalog frequency.** It uses a fixed global b-value and rough global depth-band proportions, not a live-fit model of the actual current catalog.
- **The USGS feed can lag or be temporarily delayed or unavailable.** The world engine simply skips ingestion for that pass and catches up next time; it never crashes the endpoint. Reads/writes against the shared `world.json` file are also serialized through a single in-process lock (`worldStore.transact`) and written atomically (temp file + rename), so two overlapping requests (two tabs open, a dev-mode double-poll) can no longer race and corrupt the file. An earlier version of this app didn't serialize that read-modify-write cycle and could crash the whole server under concurrent load with `Unexpected end of JSON input`; that's what this guards against now.

---

## Suggested Future Features

- **Real plate-boundary data**: swap the coarse bounding-box tectonic classifier for an actual plate-boundary GeoJSON dataset and a proper point-to-line-distance lookup.
- **A background worker for world processing**, so ingestion and aftershock-window finalization happen continuously instead of only on read.
- **Authentication and multi-operator attribution**, so the permanent ledger can record *who* made each allocation/commitment decision, not just that one was made.
- **A properly localized b-value fit**, using only quakes actually near the current aftershock zone instead of pooling the entire global feed, once there's a sensible way to define "near" for a sequence that's often still just minutes old.
- **A real ShakeMap-style regional GMICE**, replacing the current simplified attenuation formula with a properly region-calibrated one.
- **Push notifications** when a live aftershock decision window opens, so the operator doesn't have to have the tab open to catch the ~75-second window.

---

## Author

**Sagnik**

GitHub: [@HalcyonVector](https://github.com/HalcyonVector)

---

## 📄 License

MIT License. See [LICENSE](./LICENSE). Free to use, modify, and distribute, with no warranty.
