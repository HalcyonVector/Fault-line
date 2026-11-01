import { useState } from 'react';
import { Popover } from './Popover';
import type { ColorMode } from '../map/WorldMap';

interface Props {
  colorMode: ColorMode;
  onColorMode: (m: ColorMode) => void;
  minMag: number;
  onMinMag: (m: number) => void;
  showPlates: boolean;
  onShowPlates: (v: boolean) => void;
  includeOther: boolean;
  onIncludeOther: (v: boolean) => void;
}

export function MapMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const active = p.minMag > 0 || p.includeOther;
  return (
    <div className="anchor">
      <button type="button" className={`tb-btn${active ? ' tb-btn-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="tb-label">{p.minMag > 0 ? `M${p.minMag.toFixed(1)}+` : 'Filters'}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} label="Map and filters">
        <h4>Filters</h4>
        <label className="field">
          <span>Minimum magnitude: <b>{p.minMag === 0 ? 'any' : `M${p.minMag.toFixed(1)}`}</b></span>
          <input type="range" min={0} max={6} step={0.5} value={p.minMag} onChange={(e) => p.onMinMag(Number(e.target.value))} />
        </label>
        <label className="switch">
          <input type="checkbox" checked={p.includeOther} onChange={(e) => p.onIncludeOther(e.target.checked)} />
          <span>Include non-earthquake events (quarry blasts, explosions, ice quakes)</span>
        </label>
        <h4>Map</h4>
        <div className="field">
          <span>Color events by</span>
          <div className="seg seg-sm" role="group" aria-label="Color events by">
            <button type="button" aria-pressed={p.colorMode === 'depth'} onClick={() => p.onColorMode('depth')}>Depth</button>
            <button type="button" aria-pressed={p.colorMode === 'age'} onClick={() => p.onColorMode('age')}>Age</button>
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={p.showPlates} onChange={(e) => p.onShowPlates(e.target.checked)} />
          <span>Plate boundaries</span>
        </label>
      </Popover>
    </div>
  );
}
