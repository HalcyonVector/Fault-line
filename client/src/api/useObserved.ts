import { useEffect, useState } from 'react';
import type { ObservedShaking, Quake } from '../types';

const cache = new Map<string, ObservedShaking>();

/** Whether USGS is likely to have ShakeMap or DYFI products for this event, judged from the summary feed. */
export function mayHaveObserved(q: Quake): boolean {
  return q.mmi !== null || (q.felt ?? 0) > 0;
}

export function useObserved(quake: Quake | null): { data: ObservedShaking | null; loading: boolean; error: string | null } {
  const id = quake && mayHaveObserved(quake) ? quake.id : null;
  const [state, setState] = useState<{ data: ObservedShaking | null; loading: boolean; error: string | null }>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const hit = cache.get(id);
    if (hit) {
      setState({ data: hit, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetch(`/api/quakes/${encodeURIComponent(id)}/observed`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? 'USGS products unavailable');
        cache.set(id, body);
        setState({ data: body, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ data: null, loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [id]);

  return state;
}
