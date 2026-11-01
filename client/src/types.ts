export type PlateKind = 'subduction' | 'convergent' | 'divergent' | 'transform';

/** Nearest plate boundary context, attached server-side from the PB2002 model. */
export interface PlateContext {
  stepClass: string;
  kind: PlateKind;
  label: string;
  code: string;
  plates: [string, string];
  subducting: string | null;
  overriding: string | null;
  distanceKm: number;
  relativeVelocityMmYr: number;
}

/** A single normalized event, as served by GET /api/quakes. */
export interface Quake {
  id: string;
  mag: number;
  magType: string | null;
  place: string;
  time: number | null;
  updated: number | null;
  url: string | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: 'green' | 'yellow' | 'orange' | 'red' | null;
  status: string | null;
  tsunami: number;
  sig: number;
  net: string | null;
  type: string;
  lon: number;
  lat: number;
  depthKm: number;
  plate: PlateContext | null;
}

export type FeedRange = 'hour' | 'day' | 'week' | 'month';

export interface QuakeFeedResponse {
  range: FeedRange;
  feed: string;
  quakes: Quake[];
  generatedAt: number | null;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
}

export interface UserLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface AlertSettings {
  enabled: boolean;
  /** Notify for any quake at or above this magnitude, anywhere. */
  globalMinMag: number;
  /** Notify when the estimated intensity at your location reaches this MMI. */
  nearMinMmi: number;
}
