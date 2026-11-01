import { useState } from 'react';
import { Popover } from './Popover';
import { mmiRoman, mmiShaking } from '../seismology/intensity';
import type { AlertSettings, UserLocation } from '../types';

interface Props {
  settings: AlertSettings;
  onChange: (s: AlertSettings) => void;
  location: UserLocation | null;
}

const supported = typeof window !== 'undefined' && 'Notification' in window;

export function AlertsMenu({ settings, onChange, location }: Props) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported');

  const toggle = async () => {
    if (!settings.enabled && supported && Notification.permission === 'default') {
      setPermission(await Notification.requestPermission());
    }
    onChange({ ...settings, enabled: !settings.enabled });
  };

  return (
    <div className="anchor">
      <button
        type="button"
        className={`tb-btn tb-icon${settings.enabled ? ' tb-btn-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={settings.enabled ? 'Alerts on' : 'Alerts off'}
        title="Alerts"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1.3 1.5H2.7zM6.5 14h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} label="Alerts">
        <h4>Alerts</h4>
        <label className="switch">
          <input type="checkbox" checked={settings.enabled} onChange={toggle} />
          <span>Alert me about new quakes</span>
        </label>
        <label className="field">
          <span>Anywhere in the world, M{settings.globalMinMag.toFixed(1)} or larger</span>
          <input
            type="range" min={4} max={8} step={0.5} value={settings.globalMinMag}
            onChange={(e) => onChange({ ...settings, globalMinMag: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>
            Near {location ? location.label : 'you'}: estimated intensity {mmiRoman(settings.nearMinMmi)} ({mmiShaking(settings.nearMinMmi).toLowerCase()}) or
            stronger
          </span>
          <input
            type="range" min={2} max={6} step={1} value={settings.nearMinMmi} disabled={!location}
            onChange={(e) => onChange({ ...settings, nearMinMmi: Number(e.target.value) })}
          />
        </label>
        {!location && <p className="pop-text dim">Set your location to get alerts for quakes you might feel.</p>}
        <p className="pop-text dim">
          {permission === 'granted'
            ? 'System notifications are on. '
            : permission === 'denied'
              ? 'Notifications are blocked in this browser, so alerts show inside the app only. '
              : permission === 'unsupported'
                ? 'This browser has no notifications, so alerts show inside the app only. '
                : ''}
          Alerts only fire while Fault Line is open in a tab.
        </p>
      </Popover>
    </div>
  );
}
