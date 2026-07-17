import type { LedgerEntry, Site } from '../types';
import { formatRelativeTime } from '../lib/formatTime';

interface LedgerEntryRowProps {
  entry: LedgerEntry;
  sites: Site[];
  nowMs: number;
}

function siteName(sites: Site[], siteId: string | null): string {
  if (siteId === null) return 'no nearby site';
  return sites.find((s) => s.id === siteId)?.name ?? siteId;
}

export function LedgerEntryRow({ entry, sites, nowMs }: LedgerEntryRowProps) {
  if (entry.type === 'quake-impact') {
    return (
      <div className="ledger-entry">
        <span className="ledger-entry-badge ledger-entry-badge-impact">IMPACT</span>
        <div className="ledger-entry-body">
          <p className="ledger-entry-title">
            M{entry.magnitude.toFixed(1)} struck {siteName(sites, entry.siteId)}
          </p>
          <p className="ledger-entry-detail">
            intensity {entry.intensity.toFixed(1)} &middot; damage {entry.damage.toFixed(1)} &middot;{' '}
            {Math.round(entry.distanceKm)}km away &middot; {Math.round(entry.depthKm)}km deep
          </p>
        </div>
        <span className="ledger-entry-time">{formatRelativeTime(Date.parse(entry.resolvedAt), nowMs)}</span>
      </div>
    );
  }

  return (
    <div className="ledger-entry">
      <span className="ledger-entry-badge ledger-entry-badge-window">AFTERSHOCK</span>
      <div className="ledger-entry-body">
        <p className="ledger-entry-title">
          M{entry.mainshockMagnitude.toFixed(1)} mainshock near {siteName(sites, entry.nearestSiteId)}
        </p>
        <p className="ledger-entry-detail">
          {entry.committed
            ? `committed ${entry.committed.amount} resilience to ${siteName(sites, entry.committed.siteId)}`
            : 'no response committed before the window closed'}
        </p>
      </div>
      <span className="ledger-entry-time">{formatRelativeTime(Date.parse(entry.resolvedAt), nowMs)}</span>
    </div>
  );
}
