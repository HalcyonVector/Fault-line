import { useEffect, useMemo, useRef } from 'react';
import type { LedgerEntry, Site } from '../types';
import { filterLedgerBySite, sortLedgerByRecency } from '../lib/ledgerFilters';
import { LedgerEntryRow } from './LedgerEntryRow';

interface SiteDetailModalProps {
  site: Site;
  sites: Site[];
  ledger: LedgerEntry[];
  nowMs: number;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function SiteDetailModal({ site, sites, ledger, nowMs, onClose }: SiteDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const entries = useMemo(() => sortLedgerByRecency(filterLedgerBySite(ledger, site.id)), [ledger, site.id]);

  // Focus restoration lives here, not in an effect cleanup: an effect's
  // cleanup runs on every dependency change (including React 18 StrictMode's
  // deliberate dev-mode double-invocation of effects), not just on a real
  // user-initiated close, so tying "give focus back to whatever opened this"
  // to cleanup timing restored focus to the wrong thing whenever the parent
  // re-rendered (this app re-renders every second via its nowMs ticker) while
  // the modal was open. Doing it explicitly, once, right before telling the
  // parent to unmount this modal, is deterministic regardless of re-render
  // timing.
  function requestClose() {
    previouslyFocused.current?.focus();
    onCloseRef.current();
  }

  // Mount-once setup: capture what had focus, move focus into the dialog,
  // and keep Tab cycling inside it. Empty deps on purpose — this must not
  // re-run on every parent re-render (see note above).
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="site-detail-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div
        className="site-detail-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-detail-title"
      >
        <header className="site-detail-head">
          <div>
            <h2 id="site-detail-title" className="site-detail-title">
              {site.name}
            </h2>
            <p className="site-detail-subtitle">
              {site.country} &middot; {site.faultSystem}
            </p>
          </div>
          <button type="button" className="site-detail-close" onClick={requestClose} aria-label="Close site detail">
            &times;
          </button>
        </header>

        <div className="site-detail-stats">
          <div className="site-detail-stat">
            <span className="site-detail-stat-label">Resilience</span>
            <span className="site-detail-stat-value">{Math.round(site.resilience)}</span>
          </div>
          <div className="site-detail-stat">
            <span className="site-detail-stat-label">Health</span>
            <span className="site-detail-stat-value">{Math.round(site.health)}</span>
          </div>
          <div className="site-detail-stat">
            <span className="site-detail-stat-label">Overdue pressure</span>
            <span className="site-detail-stat-value">{Math.round(site.overduePressure.clamped * 100)}%</span>
          </div>
        </div>

        <p className="site-detail-note">
          Recurrence ~{site.recurrenceYears}y &middot; last major rupture ~{site.lastMajorRuptureYear} &middot;{' '}
          {(site.overduePressure.raw * 100).toFixed(0)}% of interval elapsed
        </p>
        {site.note && <p className="site-detail-note site-detail-note-secondary">{site.note}</p>}

        <h3 className="site-detail-history-heading">History ({entries.length})</h3>
        <div className="site-detail-history">
          {entries.length === 0 && <p className="ledger-empty">No real quakes have hit this site yet.</p>}
          {entries.map((entry) => (
            <LedgerEntryRow key={entry.id} entry={entry} sites={sites} nowMs={nowMs} />
          ))}
        </div>
      </div>
    </div>
  );
}
