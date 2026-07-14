import { useEffect, useRef, useState } from 'react';
import type { Quake } from '../types';

const POLL_MS = 20_000;

interface QuakeFeedApiResponse {
  quakes: Quake[];
  feed: string;
  fetchedAt: string;
  cached: boolean;
}

/**
 * Polls the server's USGS proxy (GET /api/quakes) on an interval. USGS
 * itself only updates every ~60s and the server caches for ~35s, so this
 * poll cadence is deliberately not aggressive — see the server's
 * routes/quakes.js for the caching rationale. Returns the raw list each
 * poll; the caller is responsible for diffing against previously-seen ids
 * to find genuinely *new* quakes to trigger.
 */
export function useQuakeFeed(pollMs: number = POLL_MS) {
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function poll() {
      try {
        const res = await fetch('/api/quakes');
        if (!res.ok) throw new Error(`quakes API responded ${res.status}`);
        const data: QuakeFeedApiResponse = await res.json();
        if (cancelledRef.current) return;
        setQuakes(data.quakes);
        setError(null);
      } catch (err) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : 'quake feed fetch failed');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { quakes, error, loading };
}
