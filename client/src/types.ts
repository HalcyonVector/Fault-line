/** A single normalized earthquake event, as served by GET /api/quakes. */
export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number | null; // ms epoch
  updated: number | null;
  tsunami: number;
  sig: number;
  alert: string | null;
  type: string;
  lon: number;
  lat: number;
  depthKm: number;
}

export interface QuakeFeedResponse {
  quakes: Quake[];
  feed: string;
  fetchedAt: string;
  cached: boolean;
}

export type TectonicRegion = 'ring-of-fire' | 'alpide-belt' | 'mid-atlantic-ridge' | 'intraplate-other';

/** A site's overdue-pressure gauge: (years since last major rupture) / recurrence interval. */
export interface OverduePressure {
  raw: number;
  clamped: number;
}

/** One of the six curated real portfolio sites, merged with its live world state. */
export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  faultSystem: string;
  recurrenceYears: number;
  lastMajorRuptureYear: number;
  note: string;
  resilience: number; // 0..100
  health: number; // 0..100
  overduePressure: OverduePressure;
}

export interface ResilienceBudget {
  value: number;
  cap: number;
  regenPerHour: number;
  lastRegenAt: string;
}

export interface QuakeImpactLedgerEntry {
  id: string;
  type: 'quake-impact';
  quakeId: string;
  siteId: string;
  magnitude: number;
  depthKm: number;
  distanceKm: number;
  intensity: number;
  damage: number;
  resolvedAt: string;
}

export interface AftershockWindowLedgerEntry {
  id: string;
  type: 'aftershock-window';
  mainshockQuakeId: string;
  mainshockMagnitude: number;
  mainshockSig: number;
  nearestSiteId: string | null;
  nearestSiteDistanceKm: number | null;
  opensAt: number;
  expiresAt: number;
  committed: { siteId: string; amount: number; committedAt: number } | null;
  resolvedAt: string;
}

export type LedgerEntry = QuakeImpactLedgerEntry | AftershockWindowLedgerEntry;

export interface ActiveAftershockWindow {
  id: string;
  mainshockQuakeId: string;
  mainshockMagnitude: number;
  mainshockSig: number;
  mainshockLat: number;
  mainshockLon: number;
  mainshockDepthKm: number;
  nearestSiteId: string | null;
  nearestSiteDistanceKm: number | null;
  opensAt: number;
  expiresAt: number;
  committed: { siteId: string; amount: number; committedAt: number } | null;
}

/** The full shape returned by GET /api/world. */
export interface WorldView {
  sites: Site[];
  budget: ResilienceBudget;
  /** Total ledger entries written so far. The full history lives behind GET /api/world/ledger, paginated. */
  ledgerCount: number;
  activeAftershockWindow: ActiveAftershockWindow | null;
  serverTimeMs: number;
}

/** One page of GET /api/world/ledger. */
export interface LedgerPage {
  entries: LedgerEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  totalMatching: number;
}
