import { MagBadge } from './MagBadge';
import type { Quake } from '../types';

export interface Toast {
  key: string;
  quake: Quake;
  reason: string;
}

export function Toasts({ toasts, onOpen, onDismiss }: { toasts: Toast[]; onOpen: (id: string) => void; onDismiss: (key: string) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className="toast">
          <button type="button" className="toast-main" onClick={() => { onOpen(t.quake.id); onDismiss(t.key); }}>
            <MagBadge mag={t.quake.mag} />
            <span>
              <b>{t.quake.place}</b>
              <span>{t.reason}</span>
            </span>
          </button>
          <button type="button" className="icon-btn" onClick={() => onDismiss(t.key)} aria-label="Dismiss">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
