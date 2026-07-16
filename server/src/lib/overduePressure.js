// Seismic-gap "overdue pressure": a purely informational strategic signal,
// independent of the live feed. It never triggers anything by itself — it's
// there so an operator can choose to pre-invest resilience in a site that's
// statistically overdue even though nothing has happened there (yet).

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * (years since last major rupture) / (historical recurrence interval),
 * clamped to a 0..cap range for gauge display. Returns both the raw
 * (unclamped) ratio and the clamped one, since "3x overdue" is a
 * meaningful thing to say even though a gauge needs a bound.
 */
export function computeOverduePressure(currentYear, lastMajorRuptureYear, recurrenceYears, cap = 2) {
  const yearsSince = currentYear - lastMajorRuptureYear;
  const raw = recurrenceYears > 0 ? yearsSince / recurrenceYears : 0;
  return { raw, clamped: clamp(raw, 0, cap) };
}
