import type { Quake, SeismicParams, TectonicRegion } from '../types';
import { formatRelativeTime } from '../lib/formatTime';

interface StatusPanelProps {
  unrest: number;
  dominantRegion: TectonicRegion | null;
  params: SeismicParams;
  quakeCount: number;
  lastQuake: Quake | null;
}

function fmt(n: number, digits = 1) {
  return n.toFixed(digits);
}

const REGION_LABEL: Record<TectonicRegion, string> = {
  'ring-of-fire': 'Ring of Fire',
  'alpide-belt': 'Alpide Belt',
  'mid-atlantic-ridge': 'Mid-Atlantic Ridge',
  'intraplate-other': 'Intraplate / other',
};

export function StatusPanel({ unrest, dominantRegion, params, quakeCount, lastQuake }: StatusPanelProps) {
  return (
    <div className="status-panel">
      <section className="hud-card">
        <h3>Seismic inputs</h3>
        <dl>
          <dt>Unrest index</dt>
          <dd>{fmt(unrest * 100, 0)}%</dd>
          <dt>Dominant region</dt>
          <dd>{dominantRegion ? REGION_LABEL[dominantRegion] : 'none yet'}</dd>
          <dt>Tracked quakes</dt>
          <dd>{quakeCount}</dd>
          <dt>Most recent</dt>
          <dd>
            {lastQuake
              ? `M${fmt(lastQuake.mag, 1)} · ${lastQuake.place} · ${lastQuake.depthKm.toFixed(0)}km deep · ${
                  lastQuake.time ? formatRelativeTime(lastQuake.time) : 'unknown time'
                }`
              : 'none yet'}
          </dd>
        </dl>
      </section>
      <section className="hud-card">
        <h3>Resolved drone</h3>
        <dl>
          <dt>Density</dt>
          <dd>{fmt(params.droneDensity * 100, 0)}%</dd>
          <dt>Layers</dt>
          <dd>{params.layerCount}</dd>
          <dt>Dissonance</dt>
          <dd>{fmt(params.dissonance * 100, 0)}%</dd>
          <dt>Filter cutoff</dt>
          <dd>{Math.round(params.filterCutoffHz)} Hz</dd>
          <dt>Tremolo rate</dt>
          <dd>{fmt(params.tremoloRate, 2)} Hz</dd>
          <dt>Overtone color</dt>
          <dd>{fmt(params.overtoneColor * 100, 0)}%</dd>
          <dt>Warmth</dt>
          <dd>{fmt(params.warmth * 100, 0)}%</dd>
        </dl>
      </section>
    </div>
  );
}
