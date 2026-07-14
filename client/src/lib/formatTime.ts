/** HH:MM from a fractional hour, rounding at the minute level so 22.999... reads "23:00", never "22:60". */
export function formatClock(hour: number): string {
  const totalMinutes = Math.round(hour * 60) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A short "how long ago" label for a quake's event time, e.g. "3m ago", "2h ago", "5d ago". */
export function formatRelativeTime(timeMs: number, nowMs: number = Date.now()): string {
  const deltaMs = Math.max(0, nowMs - timeMs);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
