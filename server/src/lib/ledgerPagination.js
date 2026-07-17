// Cursor-based pagination over the permanent ledger. Offset-based paging
// (skip N, take M) breaks on a list that's actively being appended to at the
// front (the exact shape of this ledger): a page you already saw shifts
// under you as new entries land, causing duplicates or skips. A cursor tied
// to a specific entry (its resolvedAt + id, not just an index) doesn't have
// that problem since new entries never get inserted anywhere except the
// front of the sort order.

/** The site a ledger entry is about, regardless of which entry shape it is. */
export function ledgerEntrySiteId(entry) {
  return entry.type === 'quake-impact' ? entry.siteId : entry.nearestSiteId;
}

// resolvedAt alone isn't a safe sort key: multiple entries from the same
// ingestion pass share the exact same resolvedAt timestamp (see
// worldEngine.js's ingestQuake, which stamps every impact from one pass with
// the same `new Date(nowMs).toISOString()`). Breaking ties by id keeps the
// order fully deterministic, which the cursor depends on.
function compareEntries(a, b) {
  const byTime = Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt);
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function cursorKey(entry) {
  return `${entry.resolvedAt}|${entry.id}`;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// A bare `Math.max(1, ... || DEFAULT_LIMIT)` looks like it falls back to the
// default for any non-positive input, but `||` only triggers on falsy
// values, and a negative number is truthy in JS: `-5 || 25` is `-5`, not
// `25`. That clamped a negative limit down to the floor of 1 instead of
// actually falling back, which is confusing behavior for a client that
// passed a bad value by mistake, not a request for a 1-item page.
function normalizeLimit(limit) {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

/**
 * One page of the ledger, newest first, optionally filtered to a single
 * site (matching either a quake-impact's siteId or an aftershock-window's
 * nearestSiteId) and continued from a previous page's cursor.
 */
export function paginateLedger(ledger, { siteId = null, cursor = null, limit = DEFAULT_LIMIT } = {}) {
  const clampedLimit = normalizeLimit(limit);

  const matching = siteId ? ledger.filter((e) => ledgerEntrySiteId(e) === siteId) : ledger.slice();
  const sorted = matching.slice().sort(compareEntries);

  let remaining = sorted;
  if (cursor) {
    const idx = sorted.findIndex((e) => cursorKey(e) === cursor);
    // A cursor that can't be found (should only happen if given a cursor
    // from a different filter) yields an empty continuation rather than
    // silently restarting from the top and re-sending already-seen entries.
    remaining = idx >= 0 ? sorted.slice(idx + 1) : [];
  }

  const entries = remaining.slice(0, clampedLimit);
  const hasMore = remaining.length > clampedLimit;
  const nextCursor = entries.length > 0 ? cursorKey(entries[entries.length - 1]) : null;

  return { entries, hasMore, nextCursor, totalMatching: matching.length };
}
