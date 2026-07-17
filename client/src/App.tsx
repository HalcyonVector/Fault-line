import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuakeFeed } from './inputs/useQuakeFeed';
import { useWorldState } from './inputs/useWorldState';
import { unrestIndex } from './seismology/unrestIndex';
import { classifyTectonicRegion } from './seismology/tectonicRegion';
import { OMORI_CONSTANTS } from './seismology/omoriAftershocks';
import { accumulateRegionEnergy, dominantRegion } from './seismology/regionDominance';
import { ThreatBoard } from './components/ThreatBoard';
import { SiteGrid } from './components/SiteGrid';
import { IntelLog } from './components/IntelLog';
import { AftershockConsole } from './components/AftershockConsole';
import type { TectonicRegion } from './types';
import './App.css';

const REGION_LABEL: Record<TectonicRegion, string> = {
  'ring-of-fire': 'Ring of Fire',
  'alpide-belt': 'Alpide Belt',
  'mid-atlantic-ridge': 'Mid-Atlantic Ridge',
  'intraplate-other': 'Intraplate / Other',
};

export default function App() {
  const { quakes, error: quakesError } = useQuakeFeed();
  const { world, error: worldError, refresh } = useWorldState();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastAllocation, setLastAllocation] = useState<{ siteId: string; amount: number } | null>(null);

  // Ticks once a second so real-time-decayed signals (global activity level,
  // aftershock countdown/probability) stay live even between polls.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Repurposed from the old audio build's "unrest index" (a decayed-energy
  // accumulator, still the same math) into a strategic HUD readout: how
  // seismically loud the whole planet has been lately, and which coarse
  // tectonic province has been driving it.
  const activityEvents = useMemo(() => quakes.map((q) => ({ magnitude: q.mag, timeMs: q.time ?? nowMs })), [quakes]);
  const globalActivity = useMemo(() => unrestIndex(activityEvents, nowMs), [activityEvents, nowMs]);
  const regionEvents = useMemo(
    () => quakes.map((q) => ({ region: classifyTectonicRegion(q.lon, q.lat), magnitude: q.mag, timeMs: q.time ?? nowMs })),
    [quakes],
  );
  const regionEnergy = useMemo(() => accumulateRegionEnergy(regionEvents, nowMs), [regionEvents, nowMs]);
  const dominant = useMemo(() => dominantRegion(regionEnergy), [regionEnergy]);

  const recentQuakes = useMemo(() => quakes.slice(0, 300), [quakes]);

  const handleAllocate = useCallback(
    async (siteId: string, amount: number) => {
      setAllocating(siteId);
      setActionError(null);
      try {
        const res = await fetch('/api/world/allocate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, amount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Allocation failed');
        refresh();
        setLastAllocation({ siteId, amount });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Allocation failed');
      } finally {
        setAllocating(null);
      }
    },
    [refresh],
  );

  // Clears the brief "+N resilience" confirmation a couple seconds after a
  // successful allocation, so it reads as a momentary flash of feedback
  // rather than a fact that's permanently glued to the card.
  useEffect(() => {
    if (!lastAllocation) return;
    const id = setTimeout(() => setLastAllocation(null), 2200);
    return () => clearTimeout(id);
  }, [lastAllocation]);

  const handleCommit = useCallback(
    async (siteId: string, amount: number) => {
      setCommitting(true);
      setActionError(null);
      try {
        const res = await fetch('/api/world/commit-aftershock-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, amount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Commit failed');
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Commit failed');
      } finally {
        setCommitting(false);
      }
    },
    [refresh],
  );

  return (
    <div className="ops-app">
      <header className="ops-header">
        <div className="ops-brand">
          <span className="ops-brand-mark">FAULT LINE</span>
          <span className="ops-brand-sub">Live Seismic Operations Command</span>
        </div>
        <div className="ops-hud-readouts">
          <div className="ops-hud-field">
            <span className="ops-hud-label">Global Activity</span>
            <span className="ops-hud-value">{(globalActivity * 100).toFixed(0)}%</span>
          </div>
          <div className="ops-hud-field">
            <span className="ops-hud-label">Dominant Region</span>
            <span className="ops-hud-value">{dominant ? REGION_LABEL[dominant] : 'N/A'}</span>
          </div>
          <div className="ops-hud-field">
            <span className="ops-hud-label">Resilience Budget</span>
            <span className="ops-hud-value">{world ? world.budget.value.toFixed(1) : 'N/A'}</span>
          </div>
          <div className="ops-hud-divider" aria-hidden="true" />
          <div className="ops-hud-field">
            <span className="ops-hud-label">Trigger Magnitude</span>
            <span className="ops-hud-value">M{OMORI_CONSTANTS.MIN_MAGNITUDE_FOR_WINDOW.toFixed(1)}+</span>
          </div>
          <div className="ops-hud-field">
            <span className="ops-hud-label">or USGS Significance</span>
            <span className="ops-hud-value">&ge;{OMORI_CONSTANTS.MIN_SIG_FOR_WINDOW}</span>
          </div>
          <div className="ops-hud-field">
            <span className="ops-hud-label">Decision Window</span>
            <span className="ops-hud-value">~60-90s</span>
          </div>
        </div>
      </header>

      {(quakesError || worldError || actionError) && (
        <div className="ops-error-bar" role="alert">
          {actionError ?? worldError ?? quakesError}
        </div>
      )}

      <main className="ops-grid">
        {world && (
          <>
            <ThreatBoard
              sites={world.sites}
              recentQuakes={recentQuakes}
              onSelectSite={setSelectedSiteId}
              selectedSiteId={selectedSiteId}
            />
            <AftershockConsole
              window={world.activeAftershockWindow}
              sites={world.sites}
              budget={world.budget.value}
              onCommit={handleCommit}
              committing={committing}
            />
            <SiteGrid
              sites={world.sites}
              budget={world.budget.value}
              onAllocate={handleAllocate}
              allocating={allocating}
              lastAllocation={lastAllocation}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
            />
          </>
        )}
        <IntelLog quakes={quakes} nowMs={nowMs} />
      </main>
    </div>
  );
}
