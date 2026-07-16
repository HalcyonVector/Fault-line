import { useEffect, useMemo, useState } from 'react';
import type { ActiveAftershockWindow, Site } from '../types';
import { damagingAftershockProbability } from '../seismology/omoriAftershocks';

const FORECAST_HORIZON_HOURS = 1;
const TICK_MS = 250;

interface AftershockConsoleProps {
  window: ActiveAftershockWindow | null;
  sites: Site[];
  budget: number;
  onCommit: (siteId: string, amount: number) => void;
  committing: boolean;
}

export function AftershockConsole({ window: win, sites, budget, onCommit, committing }: AftershockConsoleProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [amount, setAmount] = useState(10);

  useEffect(() => {
    if (!win) return;
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [win]);

  useEffect(() => {
    if (win?.nearestSiteId) setSiteId(win.nearestSiteId);
  }, [win?.id, win?.nearestSiteId]);

  const active = win !== null && nowMs < win.expiresAt && !win.committed;
  const closed = win !== null && (nowMs >= win.expiresAt || win.committed);

  const elapsedHours = win ? Math.max(0, (nowMs - win.opensAt) / (1000 * 60 * 60)) : 0;
  const remainingMs = win ? Math.max(0, win.expiresAt - nowMs) : 0;

  const probability = useMemo(() => {
    if (!win) return 0;
    return damagingAftershockProbability(win.mainshockMagnitude, elapsedHours, elapsedHours + FORECAST_HORIZON_HOURS);
  }, [win, elapsedHours]);

  const nearestSite = win ? sites.find((s) => s.id === win.nearestSiteId) : undefined;
  const canCommit = active && amount > 0 && amount <= budget && !!siteId;

  return (
    <section className={`panel aftershock-console${win ? ' aftershock-console-active' : ''}`} aria-label="Aftershock decision console">
      <header className="panel-head">
        <span className="panel-title">Aftershock Decision Console</span>
        <span className="panel-sub">{win ? (active ? 'WINDOW OPEN' : 'RESOLVED') : 'STANDBY'}</span>
      </header>

      {!win && (
        <div className="aftershock-standby">
          <span className="aftershock-standby-indicator" aria-hidden="true" />
          <div className="aftershock-standby-copy">
            <p className="aftershock-standby-title">Monitoring the live feed for a significant mainshock</p>
            <p className="aftershock-standby-detail">
              A decision window opens automatically for ~60-90 real seconds whenever a live mainshock crosses M6 (or
              high USGS significance), whether it lands near a monitored site or is simply globally notable. That
              gives you a real-time chance to commit resilience budget to an emergency response before it locks into
              the permanent ledger.
            </p>
          </div>
        </div>
      )}

      {win && (
        <div className="aftershock-body">
          <div className="aftershock-mainshock">
            <span className="aftershock-mainshock-mag">M{win.mainshockMagnitude.toFixed(1)}</span>
            <span className="aftershock-mainshock-detail">
              nearest portfolio site: {nearestSite ? nearestSite.name : 'unknown'}
              {win.nearestSiteDistanceKm != null ? ` (${Math.round(win.nearestSiteDistanceKm)}km away)` : ''}
            </span>
          </div>

          {active && (
            <>
              <div className="aftershock-countdown">
                <span className="aftershock-countdown-label">Decision window closes in</span>
                <span className="aftershock-countdown-value">{(remainingMs / 1000).toFixed(1)}s</span>
              </div>

              <div className="aftershock-probability">
                <span className="aftershock-probability-label">
                  P(damaging aftershock, next {FORECAST_HORIZON_HOURS}h), live
                </span>
                <span className="aftershock-probability-value">{(probability * 100).toFixed(2)}%</span>
              </div>

              <div className="aftershock-commit">
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site to commit response to">
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  aria-label="Resilience budget to commit"
                />
                <button type="button" disabled={!canCommit || committing} onClick={() => onCommit(siteId, amount)}>
                  {committing ? 'Committing...' : 'Commit Emergency Response'}
                </button>
              </div>
            </>
          )}

          {closed && (
            <p className="aftershock-resolved">
              {win.committed
                ? `Committed ${win.committed.amount} resilience to ${sites.find((s) => s.id === win.committed?.siteId)?.name ?? win.committed.siteId}. Locked into the permanent ledger.`
                : 'No response was committed before the window closed. Locked into the permanent ledger as a pass.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
