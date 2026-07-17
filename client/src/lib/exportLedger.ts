import type { LedgerEntry } from '../types';

/** yyyy-mm-dd-hhmmss, safe to use in a filename, from a real timestamp. */
function timestampForFilename(nowMs: number): string {
  const iso = new Date(nowMs).toISOString(); // 2026-01-01T02:03:04.000Z
  return iso.slice(0, 19).replace(/[:T]/g, '-');
}

/** Builds the exportable JSON payload and a timestamped filename for the permanent ledger. */
export function buildLedgerExport(ledger: LedgerEntry[], nowMs: number): { filename: string; json: string } {
  const payload = {
    exportedAt: new Date(nowMs).toISOString(),
    entryCount: ledger.length,
    ledger,
  };
  return {
    filename: `fault-line-ledger-${timestampForFilename(nowMs)}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}
