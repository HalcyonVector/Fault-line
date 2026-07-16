// The curated portfolio: six real cities, each on a genuinely different real
// fault system. Coordinates are approximate city centers. `recurrenceYears`
// and `lastMajorRuptureYear` are rough, rounded figures assembled from public
// seismology summaries (USGS earthquake summaries, published paleoseismic
// studies) for a hobby project — NOT authoritative hazard data, and they
// carry real uncertainty (some, like Hikurangi's, are little more than an
// order-of-magnitude estimate). See the README's Honest Limitations section.
// None of this is early-warning, prediction, or safety guidance of any kind.
export const SITES = [
  {
    id: 'san-francisco',
    name: 'San Francisco',
    country: 'USA',
    lat: 37.7749,
    lon: -122.4194,
    faultSystem: 'San Andreas Fault (transform)',
    recurrenceYears: 200,
    lastMajorRuptureYear: 1906,
    note: 'Recurrence estimate for a great (M~7.9-class) rupture on the San Francisco Peninsula segment; 1906 broke roughly 470km of the fault.',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    lat: 35.6762,
    lon: 139.6503,
    faultSystem: 'Sagami Trough / Nankai-Suruga subduction',
    recurrenceYears: 200,
    lastMajorRuptureYear: 1923,
    note: 'Recurrence estimate for a great Sagami Trough (Kanto-type) rupture; 1923 Great Kanto earthquake was the last full rupture of that segment.',
  },
  {
    id: 'istanbul',
    name: 'Istanbul',
    country: 'Turkiye',
    lat: 41.0082,
    lon: 28.9784,
    faultSystem: 'North Anatolian Fault',
    recurrenceYears: 250,
    lastMajorRuptureYear: 1766,
    note: 'The Marmara segment closest to Istanbul has not ruptured since 1766, and is widely discussed as a westward-migrating seismic gap.',
  },
  {
    id: 'kathmandu',
    name: 'Kathmandu',
    country: 'Nepal',
    lat: 27.7172,
    lon: 85.324,
    faultSystem: 'Main Frontal Thrust (Himalayan collision)',
    recurrenceYears: 500,
    lastMajorRuptureYear: 1934,
    note: 'Great Himalayan earthquakes on this collision front repeat on the order of centuries; 1934 Bihar-Nepal (M~8.0) is treated here as the last full-strain release near this segment — 2015 Gorkha (M7.8) is considered by many seismologists to have only partially released the accumulated strain.',
  },
  {
    id: 'santiago',
    name: 'Santiago',
    country: 'Chile',
    lat: -33.4489,
    lon: -70.6693,
    faultSystem: 'Peru-Chile Trench (Nazca-South American subduction)',
    recurrenceYears: 150,
    lastMajorRuptureYear: 2010,
    note: '2010 Maule (M8.8) ruptured the segment offshore central Chile nearest Santiago; historical recurrence on this stretch of margin is roughly a century to 150 years.',
  },
  {
    id: 'wellington',
    name: 'Wellington',
    country: 'New Zealand',
    lat: -41.2865,
    lon: 174.7762,
    faultSystem: 'Hikurangi subduction margin',
    recurrenceYears: 500,
    lastMajorRuptureYear: 1820,
    note: 'The least-constrained estimate in this set: no confirmed great full-margin Hikurangi rupture exists in the ~200-year written record; the recurrence interval and "last rupture" here are rough paleoseismic (turbidite-record) order-of-magnitude placeholders, not a dated event.',
  },
];

export function getSite(id) {
  return SITES.find((s) => s.id === id) ?? null;
}
