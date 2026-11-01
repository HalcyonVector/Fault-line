import { useState } from 'react';
import { Popover } from './Popover';
import type { UserLocation } from '../types';

interface Props {
  location: UserLocation | null;
  onUseGeolocation: () => Promise<void>;
  onPick: () => void;
  onClear: () => void;
}

export function LocationMenu({ location, onUseGeolocation, onPick, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const geo = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onUseGeolocation();
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Location unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="anchor">
      <button type="button" className={`tb-btn${location ? ' tb-btn-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="6.5" r="1.8" fill="currentColor" />
        </svg>
        <span className="tb-label">{location ? location.label : 'Near me'}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} label="Your location">
        <h4>Your location</h4>
        <p className="pop-text">
          Used to estimate how strongly each quake would be felt where you are, filter the feed to nearby events, and drive alerts. It
          stays in this browser.
        </p>
        <div className="pop-actions">
          <button type="button" className="btn btn-primary" onClick={geo} disabled={busy}>
            {busy ? 'Locating…' : 'Use my location'}
          </button>
          <button type="button" className="btn" onClick={() => { onPick(); setOpen(false); }}>
            Pick on map
          </button>
          {location && (
            <button type="button" className="btn btn-ghost" onClick={() => { onClear(); setOpen(false); }}>
              Clear
            </button>
          )}
        </div>
        {err && <p className="pop-error">{err}</p>}
      </Popover>
    </div>
  );
}
