import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { QuakeRow } from './QuakeRow';
import { haversineKm } from '../lib/geo';
import { estimateMmi } from '../seismology/intensity';
import type { Quake, UserLocation } from '../types';

export type SortMode = 'time' | 'mag';

interface Props {
  quakes: Quake[];
  selectedId: string | null;
  nowMs: number;
  onSelect: (id: string) => void;
  location: UserLocation | null;
  search: string;
  onSearch: (s: string) => void;
}

const PAGE = 150;

export const FeedPanel = forwardRef<HTMLInputElement, Props>(function FeedPanel({ quakes, selectedId, nowMs, onSelect, location, search, onSearch }, searchRef) {
  const [sort, setSort] = useState<SortMode>('time');
  const [nearOnly, setNearOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setLimit(PAGE), [search, sort, nearOnly, quakes]);
  useEffect(() => {
    if (!location) setNearOnly(false);
  }, [location]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let out = quakes.map((q) => ({ q, d: location ? haversineKm(location.lon, location.lat, q.lon, q.lat) : undefined }));
    if (needle) out = out.filter(({ q }) => q.place.toLowerCase().includes(needle));
    // "Near me" = anything estimated to be at least weakly felt at your location, or within 300 km.
    if (nearOnly && location) out = out.filter(({ q, d }) => d! <= 300 || estimateMmi(q.mag, d!, q.depthKm) >= 2);
    out.sort((a, b) => (sort === 'mag' ? b.q.mag - a.q.mag : (b.q.time ?? 0) - (a.q.time ?? 0)));
    return out;
  }, [quakes, search, sort, nearOnly, location]);

  // Keep the selected row in view when selection changes from the map or keyboard.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-row-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="feed">
      <div className="feed-controls">
        <label className="search">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input ref={searchRef} type="search" placeholder="Search places   ( / )" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search by place" />
        </label>
        <div className="feed-chips">
          <div className="seg seg-sm" role="group" aria-label="Sort">
            <button type="button" aria-pressed={sort === 'time'} onClick={() => setSort('time')}>Newest</button>
            <button type="button" aria-pressed={sort === 'mag'} onClick={() => setSort('mag')}>Largest</button>
          </div>
          <button
            type="button"
            className="chip"
            aria-pressed={nearOnly}
            disabled={!location}
            title={location ? 'Only events likely felt near you, or within 300 km' : 'Set your location first'}
            onClick={() => setNearOnly((n) => !n)}
          >
            Near me
          </button>
          <span className="feed-count">{rows.length.toLocaleString()} events</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{nearOnly ? 'Nothing likely felt near you in this window. Quiet is good.' : 'No events match these filters.'}</p>
      ) : (
        <ul className="rows" ref={listRef}>
          {rows.slice(0, limit).map(({ q, d }) => (
            <QuakeRow key={q.id} quake={q} selected={q.id === selectedId} nowMs={nowMs} distanceKm={d} onSelect={onSelect} />
          ))}
          {rows.length > limit && (
            <li>
              <button type="button" className="more" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, rows.length - limit)} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
});
