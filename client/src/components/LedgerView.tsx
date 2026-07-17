import { useMemo, useState } from 'react';
import type { LedgerEntry, Site } from '../types';
import { filterLedgerBySite, sortLedgerByRecency } from '../lib/ledgerFilters';
import { buildLedgerExport } from '../lib/exportLedger';
import { LedgerEntryRow } from './LedgerEntryRow';

interface LedgerViewProps {
  sites: Site[];
  ledger: LedgerEntry[];
  nowMs: number;
  initialSiteFilter?: string | null;
}

function downloadLedger(ledger: LedgerEntry[], nowMs: number) {
  const { filename, json } = buildLedgerExport(ledger, nowMs);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
        <button type="button" onClick={() => downloadLedger(ledger, nowMs)} disabled={ledger.length === 0}>
          Export JSON
        </button>
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
