import { useMemo, useState } from 'react';
import type { LedgerEntry, Site } from '../types';
import { filterLedgerBySite, sortLedgerByRecency } from '../lib/ledgerFilters';
import { LedgerEntryRow } from './LedgerEntryRow';

interface LedgerViewProps {
  sites: Site[];
  ledger: LedgerEntry[];
  nowMs: number;
  initialSiteFilter?: string | null;
}

export function LedgerView({ sites, ledger, nowMs, initialSiteFilter = null }: LedgerViewProps) {
  const [siteFilter, setSiteFilter] = useState<string | null>(initialSiteFilter);

  const entries = useMemo(
    () => sortLedgerByRecency(filterLedgerBySite(ledger, siteFilter)),
    [ledger, siteFilter],
  );

  return (
    <section className="panel ledger-view" aria-label="Permanent ledger">
      <header className="panel-head">
        <span className="panel-title">Permanent Ledger</span>
        <span className="panel-sub">
          {entries.length} of {ledger.length} entries
        </span>
      </header>

      <div className="ledger-controls">
        <label className="ledger-filter">
          <span>Site</span>
          <select value={siteFilter ?? ''} onChange={(e) => setSiteFilter(e.target.value || null)}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ledger-list">
        {entries.length === 0 && <p className="ledger-empty">No permanent ledger entries yet for this filter.</p>}
        {entries.map((entry) => (
          <LedgerEntryRow key={entry.id} entry={entry} sites={sites} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );
}
