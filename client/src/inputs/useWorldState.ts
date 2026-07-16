import { useEffect, useRef, useState } from 'react';
import type { WorldView } from '../types';

const POLL_MS = 5000;
// Poll faster while a decision window is open so a commit made from another
// tab/device shows up promptly — the countdown and probability themselves
// are computed locally from real wall-clock time, not from poll cadence.
const ACTIVE_WINDOW_POLL_MS = 2000;

/**
 * Polls the server's shared world/ledger state (GET /api/world). This is a
 * single shared, persistent world, not per-browser state — reopening the
 * app (or opening it on another device) shows the same ongoing history.
 */
export function useWorldState() {
  const [world, setWorld] = useState<WorldView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const worldRef = useRef<WorldView | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch('/api/world');
        if (!res.ok) throw new Error(`world API responded ${res.status}`);
        const data: WorldView = await res.json();
        if (cancelledRef.current) return;
        setWorld(data);
        worldRef.current = data;
        setError(null);
      } catch (err) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : 'world fetch failed');
      } finally {
        if (!cancelledRef.current) {
          const delay = worldRef.current?.activeAftershockWindow ? ACTIVE_WINDOW_POLL_MS : POLL_MS;
          timeoutId = setTimeout(poll, delay);
        }
      }
    }

    poll();
    return () => {
      cancelledRef.current = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const refresh = () => {
    fetch('/api/world')
      .then((res) => res.json())
      .then((data: WorldView) => {
        setWorld(data);
        worldRef.current = data;
      })
      .catch(() => {});
  };

  return { world, error, refresh };
}
