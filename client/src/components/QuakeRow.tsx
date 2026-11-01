import { memo } from 'react';
import { MagBadge } from './MagBadge';
import { formatRelativeTime, formatKm } from '../lib/format';
import { depthColor } from '../map/colors';
import type { Quake } from '../types';

interface Props {
  quake: Quake;
  selected: boolean;
  nowMs: number;
  distanceKm?: number;
  onSelect: (id: string) => void;
}

export const QuakeRow = memo(function QuakeRow({ quake: q, selected, nowMs, distanceKm, onSelect }: Props) {
  return (
    <li>
      <button
        type="button"
        className={`row${selected ? ' row-selected' : ''}`}
        onClick={() => onSelect(q.id)}
        aria-current={selected ? 'true' : undefined}
        data-row-id={q.id}
      >
        <MagBadge mag={q.mag} />
        <span className="row-main">
          <span className="row-place">{q.place}</span>
          <span className="row-meta">
            <span>{q.time ? formatRelativeTime(q.time, nowMs) : 'time unknown'}</span>
            <span className="row-depth">
              <i style={{ background: depthColor(q.depthKm) }} aria-hidden="true" />
              {Math.round(q.depthKm)} km deep
            </span>
            {distanceKm !== undefined && <span>{formatKm(distanceKm)} from you</span>}
          </span>
        </span>
        <span className="row-tags">
          {q.tsunami === 1 && <span className="tag tag-tsunami" title="USGS tsunami flag set">Tsunami</span>}
          {q.alert && <span className={`tag tag-pager-${q.alert}`} title="USGS PAGER alert level">{q.alert}</span>}
          {q.felt ? <span className="tag" title="'Did You Feel It?' reports">{q.felt} felt</span> : null}
          {q.type !== 'earthquake' && <span className="tag tag-muted">{q.type}</span>}
        </span>
      </button>
    </li>
  );
});
