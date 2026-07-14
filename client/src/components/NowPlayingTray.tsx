import type { CSSProperties, Ref } from 'react';
import type * as Tone from 'tone';
import type { Quake, TectonicRegion } from '../types';
import { formatRelativeTime } from '../lib/formatTime';
import { Visualizer } from './Visualizer';

interface NowPlayingTrayProps {
  unrest: number;
  dominantRegion: TectonicRegion | null;
  lastQuake: Quake | null;
  analyser: Tone.Analyser | null;
  started: boolean;
  onStart: () => void;
  onStop: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  isRecording: boolean;
  recordingUrl: string | null;
  recordingError: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  drawerToggleRef?: Ref<HTMLButtonElement>;
}

const REGION_LABEL: Record<TectonicRegion, string> = {
  'ring-of-fire': 'RING OF FIRE',
  'alpide-belt': 'ALPIDE BELT',
  'mid-atlantic-ridge': 'MID-ATLANTIC RIDGE',
  'intraplate-other': 'INTRAPLATE',
};

export function NowPlayingTray({
  unrest, dominantRegion, lastQuake, analyser, started, onStart, onStop,
  volume, onVolumeChange,
  isRecording, recordingUrl, recordingError, onStartRecording, onStopRecording,
  drawerOpen, onToggleDrawer, drawerToggleRef,
}: NowPlayingTrayProps) {
  const meta = [
    `UNREST ${Math.round(unrest * 100)}%`,
    dominantRegion ? REGION_LABEL[dominantRegion] : null,
    lastQuake ? `M${lastQuake.mag.toFixed(1)} · ${lastQuake.time ? formatRelativeTime(lastQuake.time) : ''}` : 'AWAITING QUAKES',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="tray">
      <div className="tray-time">FAULT LINE</div>
      <div className="tray-meta">{meta}</div>

      <Visualizer analyser={analyser} active={started} />

      <div className="tray-row">
        <button
          className="tray-play"
          onClick={started ? onStop : onStart}
          aria-label={started ? 'Stop' : 'Start'}
        >
          {started ? '■' : '▶'}
        </button>

        <input
          type="range"
          className="hud-range tray-volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ '--val': volume } as CSSProperties}
          aria-label="Volume"
        />

        <button
          className={`tray-dot${isRecording ? ' tray-dot--live' : ''}`}
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={!started}
          aria-label={isRecording ? 'Stop recording' : 'Record'}
          title={isRecording ? 'Stop recording' : 'Record'}
        >
          ●
        </button>

        {recordingUrl && (
          <a
            className="tray-download"
            href={recordingUrl}
            download={`fault-line-session-${Date.now()}.webm`}
            aria-label="Download recording"
            title="Download recording"
          >
            ⬇
          </a>
        )}

        <button
          ref={drawerToggleRef}
          className={`tray-drawer-toggle${drawerOpen ? ' tray-drawer-toggle--open' : ''}`}
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Close monitor panel' : 'Open monitor panel'}
          aria-expanded={drawerOpen}
          title="Monitor"
        >
          {drawerOpen ? '✕' : '⚙'}
        </button>
      </div>

      {recordingError && <div className="tray-error">{recordingError}</div>}
    </div>
  );
}
