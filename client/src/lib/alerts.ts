import { haversineKm } from './geo';
import { estimateMmi, mmiRoman } from '../seismology/intensity';
import type { AlertSettings, Quake, UserLocation } from '../types';

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { enabled: false, globalMinMag: 6, nearMinMmi: 3 };

/** Why a quake deserves an alert under these settings, or null if it doesn't. */
export function alertReason(q: Quake, settings: AlertSettings, location: UserLocation | null): string | null {
  if (location) {
    const km = haversineKm(location.lon, location.lat, q.lon, q.lat);
    const mmi = estimateMmi(q.mag, km, q.depthKm);
    if (mmi >= settings.nearMinMmi) {
      return `Possibly felt at ${location.label} (est. intensity ${mmiRoman(mmi)}, ${Math.round(km)} km away)`;
    }
  }
  if (q.mag >= settings.globalMinMag) return `M${settings.globalMinMag.toFixed(1)} or larger anywhere`;
  return null;
}

/**
 * Events in `quakes` that weren't in `seenIds`. On the very first load
 * (`seenIds` null) nothing counts as new, so opening the app never fires a
 * burst of alerts for quakes that happened before you arrived.
 */
export function newArrivals(quakes: Quake[], seenIds: Set<string> | null): Quake[] {
  if (!seenIds) return [];
  return quakes.filter((q) => !seenIds.has(q.id));
}
