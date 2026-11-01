import { useMemo } from 'react';
import { MagBadge } from './MagBadge';
import { BarChart, GrChart, StackBar } from './charts';
import {
  summarizeCatalog, histogram, globalCompleteness, bValue, cumulativeCounts, joulesToTonsTnt, formatTnt,
} from '../seismology/stats';
import { depthColor, PLATE_COLORS, PLATE_KIND_LABEL } from '../map/colors';
import { formatRelativeTime } from '../lib/format';
import type { Quake } from '../types';

interface Props {
  quakes: Quake[];
  nowMs: number;
  rangeLabel: string;
  onSelect: (id: string) => void;
}

/** "10 km SSW of Volcano, Hawaii" -> "Hawaii"; "south of the Fiji Islands" -> "Fiji Islands". */
export function regionOf(place: string): string {
  const afterComma = place.includes(',') ? place.slice(place.lastIndexOf(',') + 1).trim() : place.trim();
  return afterComma.replace(/^(north|south|east|west|central|northern|southern|eastern|western|near the|off the)(\s+(of|coast of))?\s+(the\s+)?/i, '').replace(/^the\s+/i, '') || place;
}

export function OverviewPanel({ quakes, nowMs, rangeLabel, onSelect }: Props) {
  const s = useMemo(() => summarizeCatalog(quakes), [quakes]);
  const mags = useMemo(() => quakes.map((q) => q.mag), [quakes]);
  const mc = useMemo(() => globalCompleteness(mags), [mags]);
  const b = useMemo(() => (mc === null ? null : bValue(mags, mc)), [mags, mc]);
  const gr = useMemo(() => cumulativeCounts(mags), [mags]);
  const magBins = useMemo(() => {
    const valid = mags.filter(Number.isFinite);
    if (!valid.length) return [];
    const lo = Math.floor(Math.min(...valid) * 2) / 2;
    const hi = Math.max(lo + 1, Math.ceil((Math.max(...valid) + 0.01) * 2) / 2);
    return histogram(valid, lo, hi, 0.5);
  }, [mags]);
  const regions = useMemo(() => {
    const counts = new Map<string, { n: number; max: number }>();
    for (const q of quakes) {
      const r = regionOf(q.place);
      const c = counts.get(r) ?? { n: 0, max: -Infinity };
      c.n++;
      c.max = Math.max(c.max, q.mag);
      counts.set(r, c);
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  }, [quakes]);

  if (s.count === 0) return <p className="empty">No events in this window with the current filters.</p>;
  const tnt = joulesToTonsTnt(s.totalJoules);
  const maxRegion = regions[0]?.[1].n ?? 1;

  return (
    <div className="overview">
      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Events</span>
          <span className="tile-value">{s.count.toLocaleString()}</span>
          <span className="tile-sub">{rangeLabel}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Energy released</span>
          <span className="tile-value">{formatTnt(tnt).replace(' TNT', '')}</span>
          <span className="tile-sub">TNT equivalent</span>
        </div>
        <div className="tile">
          <span className="tile-label">Felt reports</span>
          <span className="tile-value">{s.feltReports.toLocaleString()}</span>
          <span className="tile-sub">"Did You Feel It?"</span>
        </div>
        <div className="tile">
          <span className="tile-label">Tsunami flags</span>
          <span className={`tile-value${s.tsunamiFlags ? ' tile-warn' : ''}`}>{s.tsunamiFlags}</span>
          <span className="tile-sub">USGS flag, not a warning</span>
        </div>
      </div>

      {s.largest && (
        <button type="button" className="largest" onClick={() => onSelect(s.largest!.id)}>
          <MagBadge mag={s.largest.mag} size="lg" />
          <span>
            <span className="eyebrow">Largest event</span>
            <span className="largest-place">{s.largest.place}</span>
            <span className="largest-sub">
              {s.largest.time ? formatRelativeTime(s.largest.time, nowMs) : ''} · released {Math.round(s.largestShare * 100)}% of all
              energy in this window
            </span>
          </span>
        </button>
      )}

      <section className="card">
        <header>
          <h3>Magnitude distribution</h3>
          {mc !== null && <span className="hint">Mc ≈ {mc.toFixed(1)}</span>}
        </header>
        <BarChart bins={magBins} marker={mc} markerLabel="Mc" format={(bn) => `M${bn.from.toFixed(1)}-${bn.to.toFixed(1)}`} />
      </section>

      <section className="card">
        <header>
          <h3>Gutenberg-Richter</h3>
          {b ? (
            <span className="hint">
              b = {b.b.toFixed(2)} ± {b.err.toFixed(2)} <span className="dim">(n={b.n})</span>
            </span>
          ) : (
            <span className="hint dim">too few events for b</span>
          )}
        </header>
        <GrChart points={gr} mc={mc} b={b?.b ?? null} />
        <p className="note">
          {b ? `Each step up in magnitude is about ${(10 ** b.b).toFixed(0)}x rarer. ` : ''}Fit by maximum likelihood (Aki 1965) from Mc up.
          Outside dense networks USGS only catches events reliably from about M4.5, so Mc never starts lower. Global catalogs usually land
          near b = 1.
        </p>
      </section>

      <section className="card">
        <header>
          <h3>Depth</h3>
        </header>
        <StackBar
          parts={[
            { label: 'Shallow <70 km', value: s.depth.shallow, color: depthColor(20) },
            { label: 'Intermediate', value: s.depth.intermediate, color: depthColor(160) },
            { label: 'Deep >300 km', value: s.depth.deep, color: depthColor(600) },
          ]}
        />
      </section>

      <section className="card">
        <header>
          <h3>Tectonic setting</h3>
          <span className="hint dim">nearest boundary within 400 km</span>
        </header>
        <StackBar
          parts={(['subduction', 'convergent', 'transform', 'divergent', 'intraplate'] as const).map((k) => ({
            label: PLATE_KIND_LABEL[k],
            value: s.plateKinds[k] ?? 0,
            color: k === 'intraplate' ? '#5b6574' : PLATE_COLORS[k],
          }))}
        />
      </section>

      <section className="card">
        <header>
          <h3>Busiest regions</h3>
        </header>
        <ul className="regions">
          {regions.map(([name, r]) => (
            <li key={name}>
              <span className="region-name">{name}</span>
              <span className="region-bar"><i style={{ width: `${(r.n / maxRegion) * 100}%` }} /></span>
              <span className="region-n">{r.n}</span>
              <span className="region-max">max {r.max.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
