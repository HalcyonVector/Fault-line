import { useState } from 'react';
import type { Site } from '../types';

interface SiteGridProps {
  sites: Site[];
  budget: number;
  onAllocate: (siteId: string, amount: number) => void;
  allocating: string | null;
  lastAllocation?: { siteId: string; amount: number } | null;
  selectedSiteId?: string | null;
  onSelectSite?: (siteId: string) => void;
}

function Gauge({ label, value, max = 100, tone }: { label: string; value: number; max?: number; tone: 'ochre' | 'warn' | 'danger' | 'pressure' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="gauge" data-tone={tone}>
      <div className="gauge-label-row">
        <span className="gauge-label">{label}</span>
        <span className="gauge-value">{value.toFixed(max > 100 ? 2 : 0)}</span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<'ochre' | 'warn' | 'danger', string> = {
  ochre: 'Stable',
  warn: 'Watch',
  danger: 'Critical',
};

export function SiteGrid({
  sites,
  budget,
  onAllocate,
  allocating,
  lastAllocation,
  selectedSiteId,
  onSelectSite,
}: SiteGridProps) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const amountFor = (siteId: string) => amounts[siteId] ?? 5;

  return (
    <section className="panel site-grid" aria-label="Site status grid">
      <header className="panel-head">
        <span className="panel-title">Site Status</span>
        <span className="panel-sub">Resilience budget available: {budget.toFixed(1)}</span>
      </header>
      <div className="site-grid-tiles">
        {sites.map((site) => {
          const healthTone = site.health < 35 ? 'danger' : site.health < 70 ? 'warn' : 'ochre';
          const amount = amountFor(site.id);
          const canAfford = amount > 0 && amount <= budget;
          return (
            <article
              key={site.id}
              className={`site-tile${selectedSiteId === site.id ? ' site-tile-selected' : ''}`}
              data-tone={healthTone}
              onClick={() => onSelectSite?.(site.id)}
            >
              <header className="site-tile-head">
                <div className="site-tile-heading">
                  <span className="site-tile-name">{site.name}</span>
                  <span className="site-tile-country">{site.country}</span>
                </div>
                <span className="site-tile-status" data-tone={healthTone}>
                  {STATUS_LABEL[healthTone]}
                </span>
              </header>

              <p className="site-tile-fault">{site.faultSystem}</p>

              <div className="site-tile-gauges">
                <Gauge label="Resilience" value={site.resilience} tone="ochre" />
                <Gauge label="Health" value={site.health} tone={healthTone} />
                <Gauge label="Overdue Pressure" value={site.overduePressure.clamped * 100} tone="pressure" />
              </div>

              <div className="site-tile-footer">
                <p className="site-tile-meta">
                  Recurrence ~{site.recurrenceYears}y · last major rupture ~{site.lastMajorRuptureYear} ·{' '}
                  {(site.overduePressure.raw * 100).toFixed(0)}% of interval elapsed
                </p>

                <p className="site-tile-hint">Spend budget below to raise this site&rsquo;s resilience.</p>

                <div className="site-tile-allocate" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={amount}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [site.id]: Number(e.target.value) }))}
                    aria-label={`Amount to allocate to ${site.name}`}
                  />
                  <button
                    type="button"
                    disabled={!canAfford || allocating === site.id}
                    onClick={() => onAllocate(site.id, amount)}
                  >
                    {allocating === site.id ? 'Allocating...' : 'Allocate'}
                  </button>
                </div>

                {lastAllocation?.siteId === site.id && (
                  <p className="site-tile-confirm" role="status">
                    +{lastAllocation.amount} resilience committed.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
