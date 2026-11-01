/** A short "how long ago" label, e.g. "just now", "3m ago", "2h ago", "5d ago". */
export function formatRelativeTime(timeMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.floor(Math.max(0, nowMs - timeMs) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.floor(seconds / (30.44 * 86_400))}mo ago`;
  return `${Math.floor(seconds / (365.25 * 86_400))}y ago`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-01 14:05 UTC" */
export function formatUtc(timeMs: number): string {
  const d = new Date(timeMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Local wall-clock time with weekday, in the viewer's own time zone. */
export function formatLocal(timeMs: number): string {
  return new Date(timeMs).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

/** Distances: "850 m", "12 km", "1,240 km". */
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** Probability as a readable percentage: "<1%", "37%", ">99%". */
export function formatPercent(p: number): string {
  if (p < 0.01) return '<1%';
  if (p > 0.99) return '>99%';
  return `${Math.round(p * 100)}%`;
}

export function formatPopulation(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  return `${Math.round(n / 1000)}k`;
}

/** Latitude/longitude as "35.68°N 139.69°E". */
export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}
