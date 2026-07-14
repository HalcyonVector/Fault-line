# Fault Line: A Tense Generative Soundscape from Real-Time Global Earthquakes

A full-stack generative soundscape engine that composes and synthesizes sound **in real time, with no sample playback**: every drone layer, onset click, and aftershock echo is built from oscillators, noise, filters, and envelopes via the Web Audio API, continuously reshaped by the real-time global earthquake feed from the USGS Earthquake Hazards Program. The same feed drives a full-viewport animated world map: expanding ripple rings at each epicenter and a global vignette are the visual read-out of exactly what the audio engine is reacting to, not a themed skin bolted on afterward. Built with React, TypeScript, Tone.js, and Express — a sibling project to [Petrichor](../Petrichor) (which sonifies weather/time/activity into ambient music), pushed into a darker, tenser emotional register: a monitoring/unease instrument, not a cozy ambient one.

> **What it's for:** a self-playing soundscape you leave running in a tab while you work, where the tension in the room tracks the tension in the earth's crust. The sound engine, not just a themed visualizer, is the thing that was built here.

---

## Disclaimer

This project is for personal and educational use. It is **not an early-warning system, a seismic hazard tool, or a safety-critical application of any kind**, and makes no claims to that effect. "Unrest," "restlessness," and the tectonic-region coloring are stylized, deliberately simplified artistic mappings of real USGS data, not authoritative seismology. The USGS feed can lag or be temporarily delayed or unavailable, in which case the engine falls back to sensible defaults rather than failing silently. Generated audio is unbounded and probabilistic; volume and intensity can vary sharply as real quakes come in, so use your device's volume controls.

---

## Features

### Synthesis Engine (no samples)

- **Background drone** ("global seismic restlessness"): a bank of up to 5 oscillator layers (a warm sine fundamental + a partial-rich metallic overtone per layer) through a shared lowpass filter and tremolo into reverb. Layer count, filter cutoff/resonance, tremolo rate, and interval dissonance are all driven continuously by the rolling **unrest index** — quiet and open (fifths/octaves) on a calm day, dense and dissonant (minor seconds/tritones, faster beating) during an active swarm
- **Per-quake trigger**: any incoming quake at or above a user-configurable magnitude threshold (default M4.5, adjustable 2.5–7.5) fires a discrete two-stage onset — see "P/S onset" below
- **Omori-law aftershock echoes**: significant quakes (M6+, or high USGS `sig`) add a quiet, decaying train of echo pulses after the onset, timed to the real Omori-Utsu aftershock decay law compressed onto an audio timescale
- **Tectonic-region timbral coloring**: whichever coarse tectonic province has been loudest lately steers the drone's overtone color and warmth
- **Per-layer mixer**: independent 0–150% mix controls for drone/trigger/aftershock, layered on top of (not replacing) the automatic unrest-driven mapping
- **Seismic theory core**: interval-palette selection and per-region timbral coloring live in a dependency-free module (`audio/seismicTheory.ts`), the seismic analog of a music-theory module

### Live Inputs

- **Real-time USGS feed**: polls the server's proxy of the USGS Earthquake Hazards Program's `all_day` GeoJSON summary feed (see "Data Source" below)
- **Unrest index**: an exponentially-decayed accumulator of recent seismic energy (`10^(1.5*magnitude)`, half-life ~2 hours), normalized to 0..1 — it has real temporal memory, building during a swarm and cooling back down afterward, rather than reacting to an instantaneous snapshot
- **Tectonic-region dominance**: the same decayed-energy idea tracked separately per coarse tectonic province, so "which region has been loudest lately" is its own rolling signal
- **Simulate mode**: sliders for magnitude, depth, and a coarse region picker, plus "Trigger quake" (one synthetic event) and "Trigger swarm" (a staggered burst of 6–10) buttons, so the tension build/decay can be previewed without waiting for a real swarm

### Novel Mechanics

- **P/S two-stage onset** (`seismology/spDelay.ts`, `computeSPDelay`): every triggered quake is genuinely *two* scheduled sounds, mimicking a real seismogram — a quiet, sharp "P" click first, then a stronger "S" arrival after a delay computed from real approximate wave speeds (`Vp ≈ 6.5 km/s`, `Vs ≈ 3.6 km/s`) over the hypocentral depth: `delayMs = depthKm * (1/Vs - 1/Vp) * 1000`. Deeper quakes get a longer, more audible P-S gap; shallow quakes read as near-simultaneous
- **Omori-Utsu aftershock trains** (`seismology/omoriAftershocks.ts`, `generateAftershockTrain`): a pure function generating `{ delayMs, amplitude }` pulses following `rate(t) = K / (t + c)^p`, log-spaced across a compressed real-to-audio timescale (several real hours of decay become ~20–30 seconds of echoes), with both pulse count and loudness ceiling scaling with the mainshock's productivity
- **Tectonic-region classification** (`seismology/tectonicRegion.ts`, `classifyTectonicRegion`): a coarse bounding-box heuristic bucketing a quake's epicenter into Ring of Fire / Alpide Belt / Mid-Atlantic Ridge / intraplate-other, letting geography become audible as timbre rather than just ripple position on the map — see Honest Limitations below for how coarse this really is
- **Depth-driven timbre** (`seismology/energyMapping.ts`): shallow quakes (<70km) synthesize as bright, sharp, fast-transient "cracks"; deep quakes (>300km) as muffled, slow, sub-bass thuds — physically motivated by higher frequencies attenuating faster over a longer path through the earth

### Session Capture

- **Recording**: taps the master bus into a `MediaStreamAudioDestinationNode` and records it with `MediaRecorder` (WebM/Opus where supported); stop recording and a "Download recording" link appears. Purely local capture, nothing is ever uploaded

### Backend

- **USGS proxy**: server-side fetch of the `all_day` feed with a ~35-second in-memory cache, so bursty client polling never hammers USGS (which itself only updates every ~60s)
- **Presets API**: save/load/delete named magnitude-threshold snapshots (JSON-file backed)
- **Static hosting**: serves the built client in production from the same Express process

### Presets: Local-First

- Preset save/load/delete goes through the backend when it's reachable, and **transparently falls back to `localStorage`** on any network failure. The UI shows an "offline · saved locally" badge so it's never a silent surprise. The client works as a presets-capable tool even with no backend running at all

### Sharing

- **Copy share link** encodes the current magnitude threshold into a `?tension=` URL query param (`lib/shareLink.ts`). Opening that link applies it once as a manual override, then the URL is cleaned up so a refresh doesn't reapply it. The decoder validates the value before trusting it, so a malformed or tampered link just fails quietly instead of crashing the app

### PWA

- Installable app shell (`manifest.webmanifest` + a minimal same-origin service worker that deliberately never caches `/api/*`, so quakes/presets always stay live), with an SVG icon plus rasterized 192×192/512×512 PNGs for install flows that need them
- **Screen Wake Lock** while the engine is playing, so a phone or tablet doesn't fall asleep mid-session, with automatic re-acquisition if the tab regains visibility

### UI/UX: "Fault Line"

- The background **is** the interface: a full-viewport equirectangular world map with a real land silhouette (`world-atlas` + `topojson-client`, no map-tile API/key), expanding ripple rings at each epicenter (radius/duration scaled by magnitude, color by depth), and a global vignette that visibly darkens/reddens as the unrest index rises. Ripple animation is skipped under `prefers-reduced-motion`
- A single minimal glass "now playing" tray floats at the bottom: unrest %, dominant region, most recent quake, a live waveform, play/stop, volume, and record
- Every other control (Simulate mode, threshold, per-layer mixer, presets, the full input/parameter readout) lives in a collapsible "Monitor" drawer styled as an instrument HUD
- Start/Stop gated behind a user gesture (per browser autoplay policy), with a Space-bar shortcut once the page has focus (ignored while typing in a text field)
- **OS media controls** (`useMediaSession.ts`): publishes "Unrest · Threshold" as now-playing metadata with real play/pause controls to the lock screen, notification shade, Control Center, or Chrome's media widget
- **Volume, mixer levels, and threshold persist** across reloads (`lib/localSettings.ts`)
- Deliberately dark charcoal/ember/deep-red palette throughout, no light-mode toggle — a monitoring instrument doesn't make sense re-skinned bright
- **First-run onboarding hint**: a one-time callout explaining what the engine reacts to, dismissed on "Got it" or automatically on first Start

### Resilience & Accessibility

- **React error boundary** (`components/ErrorBoundary.tsx`): a top-level class component wraps the whole app, so a thrown error during render doesn't blank the page
- **Monitor drawer is a real focus trap, not just a visual overlay**: the main view and the drawer toggle native `inert` on each other based on which is open. Opening the drawer moves focus to its close button; closing it returns focus to the toggle
- **Disambiguated per-item labels**: repeated "Load"/"Delete" buttons in the presets list carry item-specific `aria-label`s (e.g. "Load preset Swarm Watch")
- **Visible focus retained everywhere inputs suppress the native outline**: the preset name field's focus ring comes from `:focus-within` on its parent row instead of disappearing

---

## Data Source

Real-time GeoJSON summary feeds from the [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/) — free, no API key, updated roughly every minute:

```
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson
```

The server polls `all_day` by default (`USGS_FEED` env var to override, e.g. `all_hour`, `2.5_day`, `significant_day`). `all_day` gives a meaningful rolling window for the unrest index — enough quakes worldwide to feel genuinely alive — without being as sparse as `all_hour` on a quiet day.

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend Framework** | React 18 + TypeScript | Vite dev server + build, strict TS config |
| **Audio Synthesis** | Tone.js 15 (Web Audio API) | Oscillators, filters, envelopes, tremolo, noise generators (no sample playback) |
| **Recording** | `MediaRecorder` + `MediaStreamAudioDestinationNode` | Local-only capture of the live master bus |
| **State** | React hooks | `useQuakeFeed`, `useRecorder`, `useWakeLock`, `useMediaSession`; no external state library needed |
| **Map** | `world-atlas` (land-110m TopoJSON) + `topojson-client` | Real cartography, bundled data, no external map-tile API/key |
| **PWA** | Web App Manifest + Service Worker + Wake Lock API | Installable shell, offline app-shell cache, screen-sleep prevention |
| **OS Media Controls** | Media Session API | Lock-screen/notification play-pause + now-playing metadata |
| **Backend Framework** | Express (Node.js, ESM) | USGS proxy + cache, presets CRUD, static hosting |
| **Quake Data** | USGS Earthquake Hazards Program | Free, keyless real-time GeoJSON feeds |
| **Persistence** | Flat JSON file (`server/data/presets.json`) + `localStorage` fallback | No database dependency; client-only mode still works |
| **Testing** | Vitest + Supertest | Pure-logic unit tests (client) and HTTP-level route tests (server) |
| **Dev Orchestration** | `concurrently` + `cross-env` | Runs client + server dev servers with one `npm run dev`; `cross-env` sets `PORT` cross-platform |

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

Open `http://localhost:5274` and click **Start** (audio requires a user gesture).

### Production

```bash
npm run build   # builds the client into client/dist (also enables the PWA service worker)
npm start        # Express serves the API + the built client on :5274 (one process, one port)
```

The port story mirrors Petrichor's, offset by one so both projects can run side by side: in **dev**, the Vite client (`:5274`) and the Express API (`:3002`, proxied) are two separate processes on different ports. In **production**, Express alone serves the built client and the API from a single process, defaulting to `:5274` (override with `PORT`).

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
├── package.json                 # root dev orchestration (concurrently) + test runner
│
├── server/
│   ├── package.json
│   ├── vitest.config.js
│   ├── data/presets.json        # flat-file preset store
│   ├── test/
│   │   ├── health.test.js
│   │   ├── quakes.test.js       # mocked USGS fetch, cache behavior
│   │   └── presets.test.js      # CRUD against an isolated temp data file
│   └── src/
│       ├── app.js               # createApp(): Express app (importable by tests)
│       ├── index.js             # createApp().listen(...)
│       └── routes/
│           ├── quakes.js        # USGS proxy + cache
│           └── presets.js       # preset CRUD
│
└── client/
    ├── package.json
    ├── vite.config.ts           # dev proxy: /api → :3002
    ├── vitest.config.ts
    ├── tsconfig.json
    ├── index.html
    ├── public/
    │   ├── manifest.webmanifest
    │   ├── sw.js                 # app-shell service worker (never caches /api/*)
    │   ├── icon.svg
    │   ├── icon-192.png
    │   └── icon-512.png
    └── src/
        ├── main.tsx              # SW registration (production builds only), wraps <App> in <ErrorBoundary>
        ├── App.tsx               # wires the feed → seismology → mapping → engine → map/tray/drawer
        ├── types.ts
        ├── audio/
        │   ├── AudioEngine.ts        # the DSP: drone layers, P/S onset, Omori echoes, mixer, recording tap
        │   ├── seismicTheory.ts      # interval palette + region color (pure)
        │   └── seismicTheory.test.ts
        ├── seismology/
        │   ├── energyMapping.ts      # magnitude→energy, decay, magnitude→amplitude, depth→brightness/cutoff/envelope
        │   ├── energyMapping.test.ts
        │   ├── unrestIndex.ts        # the rolling decayed-energy unrest index
        │   ├── unrestIndex.test.ts
        │   ├── spDelay.ts            # computeSPDelay (P/S onset gap)
        │   ├── spDelay.test.ts
        │   ├── omoriAftershocks.ts   # Omori-Utsu aftershock echo train generator
        │   ├── omoriAftershocks.test.ts
        │   ├── tectonicRegion.ts     # classifyTectonicRegion (coarse bounding-box heuristic)
        │   ├── tectonicRegion.test.ts
        │   ├── regionDominance.ts    # per-region decayed energy + dominant-region picker
        │   └── regionDominance.test.ts
        ├── map/
        │   ├── projection.ts         # equirectangular projection + ripple sizing (pure)
        │   └── projection.test.ts
        ├── inputs/
        │   ├── useQuakeFeed.ts       # polls the server's USGS proxy
        │   ├── useRecorder.ts        # MediaRecorder lifecycle → downloadable blob URL
        │   ├── useWakeLock.ts
        │   └── useMediaSession.ts    # OS lock-screen/notification play-pause + metadata
        ├── lib/
        │   ├── presetsStore.ts       # backend-first, localStorage-fallback preset CRUD
        │   ├── presetsStore.test.ts
        │   ├── shareLink.ts          # EngineConfig ↔ URL query param, validated
        │   ├── shareLink.test.ts
        │   ├── formatTime.ts         # clock + "time ago" formatting
        │   ├── formatTime.test.ts
        │   ├── localSettings.ts      # localStorage load/save for volume, mix, threshold, onboarding-seen flag
        │   └── clipboard.ts          # copy-to-clipboard with a legacy fallback
        ├── mapping/
        │   ├── parameterMapping.ts   # pure functions: unrest+region → SeismicParams, quake → TriggerParams
        │   └── parameterMapping.test.ts
        └── components/
            ├── MapScene.tsx          # full-viewport animated background + ripples
            ├── NowPlayingTray.tsx    # primary glass panel: unrest, region, transport
            ├── ControlPanel.tsx      # Monitor drawer: threshold, simulate, mixer, presets
            ├── StatusPanel.tsx       # compact input/parameter readout, inside the drawer
            ├── Visualizer.tsx
            ├── ErrorBoundary.tsx     # top-level render-error fallback
            └── OnboardingHint.tsx    # one-time first-run callout
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/quakes` | Normalized recent quakes from the cached USGS feed |
| GET | `/api/presets` | List saved presets |
| POST | `/api/presets` | Save/overwrite a preset (`{ name, params }`) |
| DELETE | `/api/presets/:name` | Delete a preset |

---

## Configuration

Optional environment variables for the server:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5274` | Server port. `npm run dev` overrides this to `3002` for the API process specifically, so it doesn't collide with the Vite client dev server also on `5274`; see the Production note above |
| `USGS_FEED` | `all_day` | Which USGS summary feed to poll (`all_hour`, `all_day`, `all_week`, `2.5_hour`, `2.5_day`, `4.5_hour`, `4.5_day`, `significant_day`, etc.) |
| `PRESETS_DATA_FILE` | `server/data/presets.json` | Overrides the preset store path, used by the test suite to isolate test data from real presets |

---

## Architecture

```
                ┌───────────────────────────────┐
                │   React + Vite (Port 5274)    │
                │   Tone.js drone + P/S + Omori   │
                │   mixer + recorder + wake lock   │
                │   unrest index / region dominance │
                │   quake feed → param mapping      │
                └──────────────┬─────────────────┘
                               │ REST (/api/*), presets fall back to
                               │ localStorage when this is unreachable
                ┌──────────────▼─────────────────┐
                │   Express (Port 3002)           │
                │   USGS feed proxy + cache         │
                │   presets CRUD                     │
                └──────┬─────────────┬─────────────┘
                       │             │
              ┌────────▼───┐   ┌─────▼──────────┐
              │ USGS feed   │   │ presets.json    │
              │ (quakes)    │   │ (flat file)      │
              └─────────────┘   └─────────────────┘
```

---

## Testing

```bash
npm test                         # both suites, from the repo root
npm test --prefix server         # Vitest + Supertest: health/quakes/presets routes
npm test --prefix client         # Vitest: seismology math, mapping, projection, presetsStore fallback, etc.
```

Coverage is intentionally scoped to deterministic, side-effect-free logic: every pure module in `seismology/`, `audio/seismicTheory.ts`, `mapping/parameterMapping.ts`, `map/projection.ts`, `lib/formatTime.ts`, `lib/shareLink.ts`, the preset store's network-failure fallback, and the Express routes (with `fetch` mocked and the data file redirected to a temp path via `PRESETS_DATA_FILE`). The stateful, Tone.js-dependent `AudioEngine` and the DOM-heavy `MapScene` component are exercised by manual/browser testing rather than unit tests, since they wrap live Web Audio nodes and SVG/CSS animation respectively — same testing philosophy as Petrichor.

While building this, the actual USGS feed path turned out to differ from the one drafted in the initial spec (`/earthquakehazards/feed/...` 404s; the real path is `/earthquakes/feed/...`). It was caught by an end-to-end smoke test (booting the production server and curling `/api/quakes` for real) rather than by the unit suite, since the route tests mock `fetch` entirely — a good example of why the manual/integration check still matters even with high unit coverage of the surrounding logic.

---

## Honest Limitations

- **This is not an early-warning or safety tool.** No claim is made or implied about detecting hazards, predicting aftershocks, or informing real-world safety decisions. Treat every number here as an art project's stylized read of public data, not a seismological instrument.
- **"Unrest"/"restlessness" is a stylized index, not a hazard metric.** It's an exponentially-decayed accumulator tuned by hand (reference energy, half-life) to feel expressive across a normal day vs. an active swarm — it has no calibrated relationship to real seismic hazard or risk.
- **Depth-as-distance-proxy for P/S timing is a simplification.** Real P/S arrival gaps depend on the true travel path and local crustal velocity structure, not just hypocentral depth through a single pair of average bulk wave speeds. This is a physically-motivated approximation, not a real travel-time-table lookup.
- **The tectonic-region classifier is coarse.** `classifyTectonicRegion` buckets coordinates with a handful of rectangular bounding boxes, not actual plate-boundary geometry. Real boundaries are irregular curves; several real provinces (the East African Rift, the exact extent of the Himalayan collision zone, back-arc basins) are approximated crudely or folded into "intraplate/other."
- **The Omori aftershock train is illustrative, not a real forecast.** It follows the real `K/(t+c)^p` decay shape and scales productivity with magnitude, but the specific constants (`p`, `c`, the compression ratio onto ~30 audio-seconds) are chosen for audible effect, not fit to any specific real aftershock sequence.
- **The USGS feed can lag or be temporarily delayed.** `all_day` events occasionally arrive minutes after `time` due to review/revision, and the server's ~35s cache adds a further small delay on top of USGS's own ~60s update cadence.
- **No polyphony pooling for simultaneous trigger events.** A real swarm can produce quakes closer together than the P/S+Omori voices are built to gracefully overlap; rapid-fire triggers can retrigger the same synth voices rather than each getting an independent one.
- **The PWA icons aren't maskable-safe.** The SVG and PNG icons are tagged `purpose: "any"`, not `"maskable"`; a maskable variant needs extra padding so OS icon masks don't clip the artwork.
- React's `<StrictMode>` is intentionally omitted: its dev-mode double effect invocation tears down and rebuilds the live Tone.js audio graph mid-session, which is more confusing than useful here.

---

## Suggested Future Features

- **Additional live inputs**: tsunami-alert flag styling, a "significant events" ticker pulled from the `significant_day`/`significant_week` feeds as a secondary, rarer accent layer
- **Real plate-boundary data**: swap the coarse bounding-box tectonic classifier for an actual plate-boundary GeoJSON dataset (e.g. a bundled simplified plate-boundary line set) and a proper point-to-line-distance lookup
- **Multi-listener sync**: a WebSocket relay so multiple browser tabs/people hear the same generative session in phase, for shared "listening rooms" during a real active swarm
- **Dockerization**: a `docker-compose.yml` bundling client + server for one-command deployment, mirroring the setup used elsewhere in this portfolio
- **Maskable PWA icon variant**: a version of the icon with enough safe-zone padding to survive OS icon masking, addressing the limitation noted above

---

## Author

**Sagnik**

GitHub: [@HalcyonVector](https://github.com/HalcyonVector)

---

## 📄 License

MIT License. See [LICENSE](./LICENSE). Free to use, modify, and distribute, with no warranty.
