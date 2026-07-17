// Core world-processing logic: regenerates the shared resilience budget on
// real wall-clock time, ingests newly-seen live USGS quakes against the
// site portfolio (computing real attenuation-based damage), opens/closes
// Omori-Utsu/Gutenberg-Richter aftershock decision windows, and finalizes
// expired windows into the permanent ledger. This is the one place that
// mutates world state; routes/world.js just calls into it and persists.
import { fetchQuakes } from './usgsFeed.js';
import { SITES, getSite } from './sites.js';
import { computeImpact, haversineDistanceKm } from './damageModel.js';
import { computeOverduePressure } from './overduePressure.js';
import { transact } from './worldStore.js';

const DAMAGE_RADIUS_KM = 2500; // beyond this the attenuation formula already floors near zero; kept as a cheap pre-filter
const MIN_LOGGED_INTENSITY = 2; // don't clutter the ledger with imperceptible shaking
const AFTERSHOCK_MIN_MAGNITUDE = 6;
const AFTERSHOCK_MIN_SIG = 600;
const AFTERSHOCK_WINDOW_MS = 75_000; // ~60-90 real seconds, per the brief
const MAX_PROCESSED_IDS = 2000; // bounded history of "already-ingested" quake ids

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function regenBudget(world, nowMs) {
  const lastRegenMs = Date.parse(world.budget.lastRegenAt);
  const elapsedHours = Math.max(0, (nowMs - lastRegenMs) / (60 * 60 * 1000));
  if (elapsedHours > 0) {
    world.budget.value = Math.min(world.budget.cap, world.budget.value + elapsedHours * world.budget.regenPerHour);
    world.budget.lastRegenAt = new Date(nowMs).toISOString();
  }
}

function finalizeExpiredWindow(world, nowMs) {
  const win = world.activeAftershockWindow;
  if (!win) return;
  if (nowMs < win.expiresAt) return;

  world.ledger.push({
    id: newId('ledger'),
    type: 'aftershock-window',
    mainshockQuakeId: win.mainshockQuakeId,
    mainshockMagnitude: win.mainshockMagnitude,
    mainshockSig: win.mainshockSig,
    nearestSiteId: win.nearestSiteId,
    nearestSiteDistanceKm: win.nearestSiteDistanceKm,
    opensAt: win.opensAt,
    expiresAt: win.expiresAt,
    committed: win.committed,
    resolvedAt: new Date(nowMs).toISOString(),
  });
  world.activeAftershockWindow = null;
}

function nearestSite(lat, lon) {
  let best = null;
  let bestDistance = Infinity;
  for (const site of SITES) {
    const d = haversineDistanceKm(site.lat, site.lon, lat, lon);
    if (d < bestDistance) {
      bestDistance = d;
      best = site;
    }
  }
  return { site: best, distanceKm: bestDistance };
}

function maybeOpenAftershockWindow(world, quake, nowMs) {
  if (world.activeAftershockWindow) return; // only one window open at a time, by design
  const significant = quake.mag >= AFTERSHOCK_MIN_MAGNITUDE || quake.sig >= AFTERSHOCK_MIN_SIG;
  if (!significant) return;

  const { site, distanceKm } = nearestSite(quake.lat, quake.lon);
  world.activeAftershockWindow = {
    id: newId('window'),
    mainshockQuakeId: quake.id,
    mainshockMagnitude: quake.mag,
    mainshockSig: quake.sig,
    mainshockLat: quake.lat,
    mainshockLon: quake.lon,
    mainshockDepthKm: quake.depthKm,
    nearestSiteId: site?.id ?? null,
    nearestSiteDistanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
    opensAt: nowMs,
    expiresAt: nowMs + AFTERSHOCK_WINDOW_MS,
    committed: null,
  };
}

function ingestQuake(world, quake, nowMs) {
  maybeOpenAftershockWindow(world, quake, nowMs);

  for (const site of SITES) {
    const distanceKm = haversineDistanceKm(site.lat, site.lon, quake.lat, quake.lon);
    if (distanceKm > DAMAGE_RADIUS_KM) continue;

    const siteState = world.sites[site.id];
    const impact = computeImpact({
      siteLat: site.lat,
      siteLon: site.lon,
      siteResilience: siteState.resilience,
      quakeLat: quake.lat,
      quakeLon: quake.lon,
      magnitude: quake.mag,
      depthKm: quake.depthKm,
    });
    if (impact.intensity < MIN_LOGGED_INTENSITY) continue;

    siteState.health = Math.max(0, Math.min(100, siteState.health - impact.damage));

    world.ledger.push({
      id: newId('ledger'),
      type: 'quake-impact',
      quakeId: quake.id,
      siteId: site.id,
      magnitude: quake.mag,
      depthKm: quake.depthKm,
      distanceKm: impact.distanceKm,
      intensity: impact.intensity,
      damage: impact.damage,
      resolvedAt: new Date(nowMs).toISOString(),
    });
  }
}

/**
 * Runs one processing pass: regen budget, finalize any expired aftershock
 * window, ingest any not-yet-seen live quakes against the portfolio. Mutates
 * and persists `world`. Never throws on a USGS fetch failure; it just skips
 * ingestion for this pass (the budget regen and window finalization above
 * still happen, and processing catches up on the next call).
 */
export async function processWorld(world, nowMs = Date.now()) {
  regenBudget(world, nowMs);
  finalizeExpiredWindow(world, nowMs);

  try {
    const { quakes } = await fetchQuakes();
    const seen = new Set(world.processedQuakeIds);
    const fresh = quakes.filter((q) => !seen.has(q.id));

    for (const quake of fresh) {
      ingestQuake(world, quake, nowMs);
      world.processedQuakeIds.push(quake.id);
    }
    if (world.processedQuakeIds.length > MAX_PROCESSED_IDS) {
      world.processedQuakeIds = world.processedQuakeIds.slice(-MAX_PROCESSED_IDS);
    }
  } catch (err) {
    console.error('[world] quake ingestion skipped (USGS unavailable):', err.message);
  }

  return world;
}

/** Loads, processes, and persists the world in one locked transaction. */
export async function tick(nowMs = Date.now()) {
  return transact(async (world) => {
    await processWorld(world, nowMs);
    return world;
  });
}

/**
 * Builds the client-facing view: site catalog metadata merged with live
 * state + derived overdue pressure. Reports `ledgerCount`, not the full
 * `ledger` array — shipping the entire, ever-growing permanent history on
 * every regular poll doesn't scale, and GET /api/world/ledger exists
 * specifically for paging through the real thing on demand.
 */
export function buildWorldView(world, nowMs = Date.now()) {
  const currentYear = new Date(nowMs).getFullYear();
  const sites = SITES.map((site) => {
    const state = world.sites[site.id] ?? { resilience: 0, health: 100 };
    const overduePressure = computeOverduePressure(currentYear, site.lastMajorRuptureYear, site.recurrenceYears);
    return {
      id: site.id,
      name: site.name,
      country: site.country,
      lat: site.lat,
      lon: site.lon,
      faultSystem: site.faultSystem,
      recurrenceYears: site.recurrenceYears,
      lastMajorRuptureYear: site.lastMajorRuptureYear,
      note: site.note,
      resilience: state.resilience,
      health: state.health,
      overduePressure,
    };
  });

  return {
    sites,
    budget: world.budget,
    ledgerCount: world.ledger.length,
    activeAftershockWindow: world.activeAftershockWindow,
    serverTimeMs: nowMs,
  };
}

export { getSite };
export const CONSTANTS = { DAMAGE_RADIUS_KM, MIN_LOGGED_INTENSITY, AFTERSHOCK_MIN_MAGNITUDE, AFTERSHOCK_MIN_SIG, AFTERSHOCK_WINDOW_MS };
