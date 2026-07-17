import type { LedgerEntry } from '../types';

/** The site a ledger entry is about, regardless of which entry shape it is. */
export function ledgerEntrySiteId(entry: LedgerEntry): string | null {
  return entry.type === 'quake-impact' ? entry.siteId : entry.nearestSiteId;
}

/** All entries for one site, or every entry when `siteId` is null. */
export function filterLedgerBySite(ledger: LedgerEntry[], siteId: string | null): LedgerEntry[] {
  if (siteId === null) return ledger;
  return ledger.filter((entry) => ledgerEntrySiteId(entry) === siteId);
}

/** Newest first, by `resolvedAt` — the ledger is append-only but not guaranteed to arrive pre-sorted. */
export function sortLedgerByRecency(ledger: LedgerEntry[]): LedgerEntry[] {
  return [...ledger].sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
}
