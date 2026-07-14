import type { CSSProperties, Ref } from 'react';
import type { MixLayer } from '../audio/AudioEngine';
import type { Quake, TectonicRegion } from '../types';
import { formatRelativeTime } from '../lib/formatTime';

export interface SimState {
  magnitude: number;
  depthKm: number;
  region: TectonicRegion;
}

const REGION_OPTIONS: { key: TectonicRegion; label: string }[] = [
  { key: 'ring-of-fire', label: 'Ring of Fire' },
  { key: 'alpide-belt', label: 'Alpide Belt' },
  { key: 'mid-atlantic-ridge', label: 'Mid-Atlantic Ridge' },
  { key: 'intraplate-other', label: 'Intraplate' },
];

const MIX_LAYERS: { key: MixLayer; label: string }[] = [
  { key: 'drone', label: 'Drone' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'aftershock', label: 'Aftershock' },
];

const REGION_LABEL: Record<TectonicRegion, string> = {
  'ring-of-fire': 'RING OF FIRE',
  'alpide-belt': 'ALPIDE BELT',
  'mid-atlantic-ridge': 'MID-ATLANTIC RIDGE',
  'intraplate-other': 'INTRAPLATE',
};

interface ConsoleRackProps {
  unrest: number;
  dominantRegion: TectonicRegion | null;
  lastQuake: Quake | null;

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

  simulate: boolean;
  onToggleSimulate: (v: boolean) => void;
  sim: SimState;
  onSimChange: (patch: Partial<SimState>) => void;
  onTriggerOne: () => void;
  onTriggerSwarm: () => void;

  magnitudeThreshold: number;
  onThresholdChange: (v: number) => void;

  mix: Record<MixLayer, number>;
  onMixChange: (layer: MixLayer, value: number) => void;

  onOpenPresets: () => void;
  presetsButtonRef?: Ref<HTMLButtonElement>;
}

function fillVar(value: number, min: number, max: number): CSSProperties {
  return { '--val': (value - min) / (max - min) } as CSSProperties;
}

/**
 * The permanent instrument rack: transport, source (Live/Simulate), trigger
 * threshold, per-layer mixer, and a button that opens the Presets dialog.
 * Everything here is part of the always-visible layout — there is no
 * icon-triggered slide-out panel anywhere in this component, unlike the
 * "Monitor" drawer this replaces.
 */
export function ConsoleRack({
  unrest, dominantRegion, lastQuake,
  started, onStart, onStop, volume, onVolumeChange,
  isRecording, recordingUrl, recordingError, onStartRecording, onStopRecording,
  simulate, onToggleSimulate, sim, onSimChange, onTriggerOne, onTriggerSwarm,
  magnitudeThreshold, onThresholdChange,
  mix, onMixChange,
  onOpenPresets, presetsButtonRef,
}: ConsoleRackProps) {
  const meta = [
    `UNREST ${Math.round(unrest * 100)}%`,
    dominantRegion ? REGION_LABEL[dominantRegion] : null,
    lastQuake ? `M${lastQuake.mag.toFixed(1)} · ${lastQuake.time ? formatRelativeTime(lastQuake.time) : ''}` : 'AWAITING QUAKES',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <footer className="rack" aria-label="Instrument console">
      <div className="rack-readout">
        <span className="rack-brand">FAULT LINE</span>
        <span className="rack-meta">{meta}</span>
      </div>

      <div className="rack-modules">
        <section className="rack-module rack-module--transport" aria-label="Transport">
          <h3>Transport</h3>
          <div className="rack-transport-row">
            <button
              type="button"
              className="rack-play"
              onClick={started ? onStop : onStart}
              aria-label={started ? 'Stop' : 'Start'}
            >
              {started ? '■' : '▶'}
            </button>

            <label className="rack-volume-label">
              <span>Vol</span>
              <input
                type="range"
                className="hud-range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                style={{ '--val': volume } as CSSProperties}
                aria-label="Volume"
              />
            </label>

            <button
              type="button"
              className={isRecording ? 'rack-dot rack-dot--live' : 'rack-dot'}
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={!started}
              aria-label={isRecording ? 'Stop recording' : 'Record'}
              title={isRecording ? 'Stop recording' : 'Record'}
            >
              ●
            </button>

            {recordingUrl && (
              <a
                className="rack-download"
                href={recordingUrl}
                download={`fault-line-session-${Date.now()}.webm`}
                aria-label="Download recording"
                title="Download recording"
              >
                ⬇
              </a>
            )}
          </div>
          {recordingError && <div className="rack-error">{recordingError}</div>}
        </section>

        <section className="rack-module rack-module--source" aria-label="Source">
          <h3>Source</h3>
          <div className="toggle-track" role="group" aria-label="Signal source">
            <button
              type="button"
              role="switch"
              aria-checked={!simulate}
              className={!simulate ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
              onClick={() => onToggleSimulate(false)}
            >
              Live
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={simulate}
              className={simulate ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
              onClick={() => onToggleSimulate(true)}
            >
              Simulate
            </button>
          </div>

          <label className="dial-row">
            <span>Threshold</span>
            <b>M{magnitudeThreshold.toFixed(1)}</b>
            <input
              type="range" className="hud-range" min={2.5} max={7.5} step={0.1} value={magnitudeThreshold}
              style={fillVar(magnitudeThreshold, 2.5, 7.5)}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              aria-label="Trigger magnitude threshold"
            />
          </label>

          {simulate && (
            <div className="sim-sliders">
              <label className="dial-row">
                <span>Magnitude</span>
                <b>M{sim.magnitude.toFixed(1)}</b>
                <input
                  type="range" className="hud-range" min={2} max={9} step={0.1} value={sim.magnitude}
                  style={fillVar(sim.magnitude, 2, 9)}
                  onChange={(e) => onSimChange({ magnitude: Number(e.target.value) })}
                />
              </label>
              <label className="dial-row">
                <span>Depth</span>
                <b>{sim.depthKm.toFixed(0)}km</b>
                <input
                  type="range" className="hud-range" min={0} max={700} step={5} value={sim.depthKm}
                  style={fillVar(sim.depthKm, 0, 700)}
                  onChange={(e) => onSimChange({ depthKm: Number(e.target.value) })}
                />
              </label>
              <div className="region-row" role="group" aria-label="Simulated region">
                {REGION_OPTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={sim.region === r.key ? 'toggle-btn toggle-btn--active' : 'toggle-btn'}
                    aria-pressed={sim.region === r.key}
                    onClick={() => onSimChange({ region: r.key })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="sim-trigger-row">
                <button type="button" onClick={onTriggerOne}>Trigger quake</button>
                <button type="button" onClick={onTriggerSwarm} className="ghost">
                  Trigger swarm
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rack-module rack-module--mixer" aria-label="Mixer">
          <h3>Mixer</h3>
          <div className="mixer-sliders">
            {MIX_LAYERS.map(({ key, label }) => (
              <label key={key} className="dial-row">
                <span>{label}</span>
                <b>{Math.round(mix[key] * 100)}%</b>
                <input
                  type="range" className="hud-range" min={0} max={1.5} step={0.01} value={mix[key]}
                  style={fillVar(mix[key], 0, 1.5)}
                  onChange={(e) => onMixChange(key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rack-module rack-module--presets" aria-label="Presets">
          <h3>Presets</h3>
          <button ref={presetsButtonRef} type="button" className="rack-presets-btn" onClick={onOpenPresets}>
            Open presets…
          </button>
        </section>
      </div>
    </footer>
  );
}
