import { useEffect, useState } from 'react';
import { archiveParams, type ArchiveQuery } from '../lib/archive';
import type { Quake } from '../types';

export interface ArchiveState {
  quakes: Quake[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

/** Runs an archive search whenever `query` changes (null = idle). */
export function useArchive(query: ArchiveQuery | null): ArchiveState {
  const [state, setState] = useState<ArchiveState>({ quakes: [], truncated: false, loading: false, error: null });
  const key = query ? archiveParams(query).toString() : null;

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/archive?${key}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? 'Archive search failed');
        setState({ quakes: body.quakes, truncated: body.truncated, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ quakes: [], truncated: false, loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [key]);

  return state;
}
