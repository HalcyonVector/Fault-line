import { useState } from 'react';
import { DEPTH_STOPS, PLATE_COLORS, PLATE_KIND_LABEL, magRadius } from '../map/colors';
import type { ColorMode } from '../map/WorldMap';
import type { PlateKind } from '../types';

export function Legend({ colorMode, showPlates, style }: { colorMode: ColorMode; showPlates: boolean; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(true);
  const gradient =
    colorMode === 'depth'
      ? `linear-gradient(90deg, ${DEPTH_STOPS.map(([d, c]) => `rgb(${c.join(',')}) ${(Math.sqrt(d) / Math.sqrt(700)) * 100}%`).join(', ')})`
      : 'linear-gradient(90deg, rgb(255,245,214), rgb(255,183,77) 4%, rgb(255,107,53) 25%, rgb(168,70,92) 60%, rgb(70,82,102))';
  return (
    <div className={`legend${open ? '' : ' legend-closed'}`} style={style}>
      <button type="button" className="legend-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Legend
        <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d={open ? 'M2 6l3-3 3 3' : 'M2 4l3 3 3-3'} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {open && (
        <div className="legend-body">
          <div className="legend-row">
            <span className="legend-title">{colorMode === 'depth' ? 'Depth' : 'Age'}</span>
            <div className="legend-gradient" style={{ background: gradient }} />
            <div className="legend-ticks">
              {colorMode === 'depth' ? (
                <><span>0</span><span>70</span><span>300</span><span>700 km</span></>
              ) : (
                <><span>now</span><span>oldest</span></>
              )}
            </div>
          </div>
          <div className="legend-row legend-sizes">
            <span className="legend-title">Magnitude</span>
            <svg width="132" height="34" aria-hidden="true">
              {[3, 5, 7].map((m, i) => (
                <g key={m} transform={`translate(${14 + i * 46}, 17)`}>
                  <circle r={magRadius(m)} className="legend-circle" />
                  <text x={magRadius(m) + 3} y={4}>{m}</text>
                </g>
              ))}
            </svg>
          </div>
          {showPlates && (
            <div className="legend-row">
              <span className="legend-title">Plate boundaries</span>
              <ul className="legend-plates">
                {(['subduction', 'convergent', 'transform', 'divergent'] as PlateKind[]).map((k) => (
                  <li key={k}><i style={{ background: PLATE_COLORS[k] }} />{PLATE_KIND_LABEL[k]}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
