import { useState } from 'react';
import { ARCHIVE_PRESETS, describeArchive, type ArchiveQuery } from '../lib/archive';
import { CitySearch } from './CitySearch';
import type { UserLocation } from '../types';

interface Props {
  query: ArchiveQuery | null;
  onRun: (q: ArchiveQuery) => void;
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  count: number;
  truncated: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The archive search form: one-click presets plus a custom query. */
export function ArchivePanel({ query, onRun, location, loading, error, count, truncated }: Props) {
  const [draft, setDraft] = useState<ArchiveQuery>(
    () => query ?? { start: '1970-01-01', end: todayIso(), minMag: 6.5, near: null, orderBy: 'magnitude', limit: 1000 },
  );
  const set = (patch: Partial<ArchiveQuery>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="archive">
      <p className="archive-intro">
        Search the USGS catalog back to 1900. Results load onto the map, the list and the Overview, and Replay plays them through time.
      </p>
      <div className="presets">
        {ARCHIVE_PRESETS.map((p) => {
          const disabled = p.needsLocation && !location;
          return (
            <button
              key={p.id}
              type="button"
              className="preset"
              disabled={disabled}
              title={disabled ? 'Set your location first' : undefined}
              onClick={() => {
                const q = p.build(new Date(), location);
                setDraft(q);
                onRun(q);
              }}
            >
              <b>{p.label}</b>
              <span>{p.description}</span>
            </button>
          );
        })}
      </div>

      <form
        className="archive-form"
        onSubmit={(e) => {
          e.preventDefault();
          onRun(draft);
        }}
      >
        <h4>Custom search</h4>
        <div className="form-row">
          <label>
            From
            <input type="date" min="1900-01-01" max={draft.end} value={draft.start} onChange={(e) => set({ start: e.target.value })} required />
          </label>
          <label>
            To
            <input type="date" min={draft.start} max={todayIso()} value={draft.end} onChange={(e) => set({ end: e.target.value })} required />
          </label>
        </div>
        <label className="field">
          <span>Minimum magnitude: <b>M{draft.minMag.toFixed(1)}</b></span>
          <input type="range" min={2.5} max={9} step={0.5} value={draft.minMag} onChange={(e) => set({ minMag: Number(e.target.value) })} />
        </label>
        <div className="field">
          <span>Where</span>
          <div className="seg seg-sm seg-full" role="group" aria-label="Area">
            <button type="button" aria-pressed={!draft.near} onClick={() => set({ near: null })}>Worldwide</button>
            <button
              type="button"
              aria-pressed={!!draft.near}
              disabled={!draft.near && !location}
              onClick={() => location && set({ near: { ...location, radiusKm: draft.near?.radiusKm ?? 300 } })}
              title={location ? undefined : 'Set your location or search a city below'}
            >
              {draft.near ? `Near ${draft.near.label}` : 'Near me'}
            </button>
          </div>
          <CitySearch placeholder="…or around a city" onPick={(c) => set({ near: { lat: c.lat, lon: c.lon, label: c.name, radiusKm: draft.near?.radiusKm ?? 300 } })} />
          {draft.near && (
            <label className="field">
              <span>Radius: <b>{draft.near.radiusKm} km</b></span>
              <input type="range" min={50} max={2000} step={50} value={draft.near.radiusKm} onChange={(e) => set({ near: { ...draft.near!, radiusKm: Number(e.target.value) } })} />
            </label>
          )}
        </div>
        <div className="form-row form-row-end">
          <label>
            Keep the
            <select value={draft.orderBy} onChange={(e) => set({ orderBy: e.target.value as ArchiveQuery['orderBy'] })}>
              <option value="magnitude">largest</option>
              <option value="time">most recent</option>
            </select>
          </label>
          <label>
            up to
            <select value={draft.limit} onChange={(e) => set({ limit: Number(e.target.value) })}>
              {[250, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {query && (
        <p className={`archive-status${error ? ' archive-error' : ''}`} role="status">
          {error
            ? error
            : loading
              ? `Searching ${describeArchive(query)}…`
              : `${count.toLocaleString()} events · ${describeArchive(query)}${truncated ? ` · showing the ${query.orderBy === 'magnitude' ? 'largest' : 'latest'} ${query.limit}` : ''}`}
        </p>
      )}
    </div>
  );
}
