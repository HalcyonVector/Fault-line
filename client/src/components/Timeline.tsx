import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import type { TimeBin } from '../lib/timeline';
import { depthColor } from '../map/colors';

interface Props {
  bins: TimeBin[];
  startMs: number;
  endMs: number;
  cursorMs: number | null;
  playing: boolean;
  rangeLabel: string;
  onScrub: (ms: number) => void;
  onTogglePlay: () => void;
  onLive: () => void;
}

const fmt = (ms: number, spanMs: number) =>
  new Date(ms).toLocaleString(undefined, spanMs > 2 * 86_400_000 ? { month: 'short', day: 'numeric', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' });

export function Timeline({ bins, startMs, endMs, cursorMs, playing, rangeLabel, onScrub, onTogglePlay, onLive }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const span = Math.max(1, endMs - startMs);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const cursorFrac = cursorMs === null ? 1 : (cursorMs - startMs) / span;

  const scrubTo = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onScrub(startMs + f * span);
  };

  const onDown = (e: ReactPointerEvent) => {
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = span / bins.length;
    const cur = cursorMs ?? endMs;
    if (e.key === 'ArrowLeft') onScrub(Math.max(startMs, cur - step));
    else if (e.key === 'ArrowRight') {
      if (cur + step >= endMs) onLive();
      else onScrub(cur + step);
    } else if (e.key === 'End') onLive();
    else if (e.key === 'Home') onScrub(startMs);
    else return;
    e.preventDefault();
  };

  return (
    <div className="timeline">
      <button type="button" className="play" onClick={onTogglePlay} aria-label={playing ? 'Pause replay' : 'Replay this window'} title="Replay (Space)">
        {playing ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="timeline-body">
        <div className="timeline-labels">
          <span>{rangeLabel}</span>
          <span className="timeline-cursor-label">
            {cursorMs === null ? (
              <><i className="live-dot" /> Live</>
            ) : (
              <>
                Replaying · {fmt(cursorMs, span)}{' '}
                <button type="button" className="link" onClick={onLive}>Back to live</button>
              </>
            )}
          </span>
        </div>
        <div
          ref={trackRef}
          className="timeline-track"
          onPointerDown={onDown}
          onPointerMove={(e) => dragging.current && scrubTo(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          role="slider"
          tabIndex={0}
          aria-label="Replay position"
          aria-valuemin={startMs}
          aria-valuemax={endMs}
          aria-valuenow={cursorMs ?? endMs}
          aria-valuetext={cursorMs === null ? 'Live' : new Date(cursorMs).toLocaleString()}
          onKeyDown={onKey}
        >
          <div className="timeline-bars">
            {bins.map((b) => (
              <span
                key={b.start}
                className={cursorMs !== null && b.start > cursorMs ? 'future' : ''}
                style={{
                  height: `${b.count === 0 ? 0 : Math.max(6, (Math.sqrt(b.count) / Math.sqrt(max)) * 100)}%`,
                  background: b.maxMag >= 5 ? depthColor(0) : b.maxMag >= 4 ? 'rgba(255, 153, 64, 0.75)' : 'rgba(170, 186, 204, 0.42)',
                }}
                title={`${b.count} events, max M${Number.isFinite(b.maxMag) ? b.maxMag.toFixed(1) : '-'}`}
              />
            ))}
          </div>
          <div className="timeline-head" style={{ left: `${cursorFrac * 100}%` }} />
        </div>
        <div className="timeline-axis">
          <span>{fmt(startMs, span)}</span>
          <span>{fmt(startMs + span / 2, span)}</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}
