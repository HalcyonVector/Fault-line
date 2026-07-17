import { useCallback, useEffect, useRef, useState } from 'react';
import type { LedgerEntry, LedgerPage } from '../types';

const PAGE_SIZE = 25;

/**
 * Pages through GET /api/world/ledger for one site filter (or the whole
 * ledger, when `siteId` is null). Resets and refetches from the top whenever
 * `siteId` changes; `loadMore` appends the next page using the cursor from
 * the previous response.
 */
export function useLedgerPage(siteId: string | null) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalMatching, setTotalMatching] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  // Guards against a stale in-flight request (e.g. a slow first page for the
  // old siteId) landing after the filter has already changed and clobbering
  // the new filter's results.
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(async (reset: boolean) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (siteId) params.set('siteId', siteId);
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);

      const res = await fetch(`/api/world/ledger?${params.toString()}`);
      const data: LedgerPage = await res.json();
      if (!res.ok) throw new Error((data as unknown as { message?: string }).message ?? 'Failed to load ledger');
      if (requestId !== requestIdRef.current) return; // superseded by a newer request

      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
      setTotalMatching(data.totalMatching);
      setEntries((prev) => (reset ? data.entries : [...prev, ...data.entries]));
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load ledger');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    cursorRef.current = null;
    setEntries([]);
    fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) fetchPage(false);
  }, [fetchPage, loading, hasMore]);

  return { entries, hasMore, totalMatching, loading, error, loadMore };
}
