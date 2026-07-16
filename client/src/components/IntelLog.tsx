import { useEffect, useRef, useState } from 'react';
import type { Quake, TectonicRegion } from '../types';
import { classifyTectonicRegion } from '../seismology/tectonicRegion';
import { rarityScore, rarityTier } from '../seismology/rarityScore';
import { generateEventGlyph } from '../seismology/glyph';
import { formatRelativeTime } from '../lib/formatTime';

const MAX_ENTRIES = 60;
const NEW_ENTRY_FLASH_MS = 1400;

interface IntelLogProps {
  quakes: Quake[];
  nowMs: number;
}

const REGION_LABEL: Record<TectonicRegion, string> = {
  'ring-of-fire': 'Ring of Fire',
  'alpide-belt': 'Alpide Belt',
  'mid-atlantic-ridge': 'Mid-Atlantic Ridge',
  'intraplate-other': 'Intraplate / Other',
};

export function IntelLog({ quakes, nowMs }: IntelLogProps) {
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const incoming = quakes.filter((q) => !seenRef.current.has(q.id));
    if (incoming.length === 0) return;
    incoming.forEach((q) => seenRef.current.add(q.id));
    setFreshIds((prev) => new Set([...prev, ...incoming.map((q) => q.id)]));
    const timeout = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        incoming.forEach((q) => next.delete(q.id));
        return next;
      });
    }, NEW_ENTRY_FLASH_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quakes]);

  const sorted = [...quakes].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, MAX_ENTRIES);

  return (
    <section className="panel intel-log" aria-label="Global intelligence log">
      <header className="panel-head">
        <span className="panel-title">Intelligence Feed</span>
        <span className="panel-sub">{quakes.length} tracked globally</span>
      </header>
      <ol className="intel-log-list">
        {sorted.map((q) => {
          const region = classifyTectonicRegion(q.lon, q.lat);
          const score = rarityScore(q.mag, q.depthKm);
          const tier = rarityTier(score);
          const bars = generateEventGlyph(q.id, q.mag, q.depthKm);
          const isFresh = freshIds.has(q.id);
          return (
            <li key={q.id} className={`intel-entry${isFresh ? ' intel-entry-new' : ''}`} data-tier={tier}>
              <div className="intel-entry-glyph" aria-hidden="true">
                {bars.map((h, i) => (
                  <span key={i} style={{ height: `${h * 100}%` }} />
                ))}
              </div>
              <div className="intel-entry-body">
                <div className="intel-entry-row">
                  <span className="intel-entry-mag">M{q.mag.toFixed(1)}</span>
                  <span className="intel-entry-place">{q.place}</span>
                  <span className="intel-entry-time">{formatRelativeTime(q.time ?? nowMs, nowMs)}</span>
                </div>
                <div className="intel-entry-row intel-entry-meta">
                  <span className="intel-entry-region">{REGION_LABEL[region]}</span>
                  <span>depth {Math.round(q.depthKm)}km</span>
                  <span className="intel-entry-rarity" data-tier={tier}>
                    rarity {score} · {tier}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="intel-log-empty">Awaiting live feed…</li>}
      </ol>
    </section>
  );
}
