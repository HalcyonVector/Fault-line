import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedRange, QuakeFeedResponse } from '../types';

const POLL_MS: Record<FeedRange, number> = { hour: 30_000, day: 60_000, week: 90_000, month: 300_000 };

export interface FeedState {
  data: QuakeFeedResponse | null;
  error: string | null;
  loading: boolean;
  /** When the client last received a successful response. */
  receivedAt: number | null;
  refresh: () => void;
}

/** Polls GET /api/quakes for one range; keeps the previous range's data on screen until the new one lands. */
export function useQuakeFeed(range: FeedRange): FeedState {
  const [data, setData] = useState<QuakeFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();

    const load = async () => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/quakes?range=${range}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Feed error ${res.status}`);
        if (cancelled || id !== reqId.current) return;
        setData(body as QuakeFeedResponse);
        setError(null);
        setReceivedAt(Date.now());
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Could not reach the quake feed');
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(load, document.hidden ? POLL_MS[range] * 2 : POLL_MS[range]);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [range, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, receivedAt, refresh };
}
