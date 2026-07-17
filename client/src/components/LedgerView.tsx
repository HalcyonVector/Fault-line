import { useState } from 'react';
import type { Site } from '../types';
import { useLedgerPage } from '../inputs/useLedgerPage';
import { LedgerEntryRow } from './LedgerEntryRow';

interface LedgerViewProps {
  sites: Site[];
  nowMs: number;
  initialSiteFilter?: string | null;
}

export function LedgerView({ sites, nowMs, initialSiteFilter = null }: LedgerViewProps) {
  const [siteFilter, setSiteFilter] = useState<string | null>(initialSiteFilter);
  const { entries, hasMore, totalMatching, loading, error, loadMore } = useLedgerPage(siteFilter);

  return (
    <section className="panel ledger-view" aria-label="Permanent ledger">
      <header className="panel-head">
        <span className="panel-title">Permanent Ledger</span>
        <span className="panel-sub">
          {entries.length} of {totalMatching} entries loaded
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

      {error && <div className="ops-error-bar" role="alert">{error}</div>}

      <div className="ledger-list">
        {entries.length === 0 && !loading && (
          <p className="ledger-empty">No permanent ledger entries yet for this filter.</p>
        )}
        {entries.map((entry) => (
          <LedgerEntryRow key={entry.id} entry={entry} sites={sites} nowMs={nowMs} />
        ))}
        {hasMore && (
          <button type="button" className="ledger-load-more" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </section>
  );
}
