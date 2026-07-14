import { useEffect, useRef } from 'react';
import type { Preset } from '../types';
import type { PresetSource } from '../lib/presetsStore';

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconLink() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M6.5 9.5 9.5 6.5" />
      <path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L10.7 7.9M9 11.8l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.3 8.1" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.2 8.4 6.3 11.5 12.8 5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none">
      <path d="M4.5 3.3v9.4a.6.6 0 0 0 .93.5l7.3-4.7a.6.6 0 0 0 0-1l-7.3-4.7a.6.6 0 0 0-.93.5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.3 4.7h9.4" />
      <path d="M6.2 4.7V3.3h3.6v1.4M6.7 7.3v3.6M9.3 7.3v3.6" />
      <path d="M4.4 4.7 5 12.1c.05.6.55 1 1.15 1h3.7c.6 0 1.1-.4 1.15-1l.6-7.4" />
    </svg>
  );
}

function IconSeismograph() {
  return (
    <svg {...ICON_PROPS} width={22} height={22}>
      <path d="M2 9h2.4l1.4-4.6L8.2 12l1.6-6.4L11 9H14" />
    </svg>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface PresetsModalProps {
  presets: Preset[];
  presetsSource: PresetSource;
  presetName: string;
  onPresetNameChange: (v: string) => void;
  onSavePreset: () => void;
  onLoadPreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onCopyShareLink: () => void;
  linkCopied: boolean;
  onClose: () => void;
}

/**
 * A genuine modal dialog for preset management — save/load/delete named
 * threshold snapshots plus the share-link copy action. Unlike the old
 * icon-triggered slide-out "Monitor" drawer, this is opened by an explicit,
 * always-visible "Open presets…" button in the console rack, and it gets its
 * own real focus trap (Tab/Shift+Tab wrap inside, Escape closes, focus
 * returns to the triggering button on close) rather than reusing that
 * drawer's inert-based mechanism.
 */
export function PresetsModal({
  presets, presetsSource, presetName, onPresetNameChange, onSavePreset, onLoadPreset, onDeletePreset,
  onCopyShareLink, linkCopied, onClose,
}: PresetsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presets-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id="presets-modal-title">Presets</span>
          <button ref={closeButtonRef} type="button" className="modal-close" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="hud-card">
          <h3>
            <span>Saved thresholds</span>
            {presetsSource === 'local' && <span className="badge">offline · saved locally</span>}
          </h3>
          <div className="preset-save-row">
            <input
              type="text" placeholder="Name this threshold…" value={presetName}
              onChange={(e) => onPresetNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) onSavePreset();
              }}
            />
            <button type="button" onClick={onSavePreset} disabled={!presetName.trim()}>Save</button>
          </div>
          <button
            type="button"
            className={linkCopied ? 'share-link-btn share-link-btn--copied' : 'share-link-btn'}
            onClick={onCopyShareLink}
          >
            {linkCopied ? <IconCheck /> : <IconLink />}
            {linkCopied ? 'Link copied' : 'Copy share link'}
          </button>

          {presets.length > 0 ? (
            <ul className="presets-list">
              {presets.map((p) => (
                <li key={p.name}>
                  <span>{p.name}</span>
                  <button
                    type="button"
                    className="preset-action-btn"
                    onClick={() => onLoadPreset(p.name)}
                    aria-label={`Load preset ${p.name}`}
                  >
                    <IconPlay /> Load
                  </button>
                  <button
                    type="button"
                    className="preset-action-btn preset-action-btn--danger"
                    onClick={() => onDeletePreset(p.name)}
                    aria-label={`Delete preset ${p.name}`}
                  >
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="presets-empty">
              <IconSeismograph />
              <p>
                No presets saved yet.
                <br />
                Dial in a threshold and save it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
