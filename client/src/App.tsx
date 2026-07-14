import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, type MixLayer } from './audio/AudioEngine';
import { useQuakeFeed } from './inputs/useQuakeFeed';
import { useRecorder } from './inputs/useRecorder';
import { useWakeLock } from './inputs/useWakeLock';
import { useMediaSession } from './inputs/useMediaSession';
import { mapUnrestToParams } from './mapping/parameterMapping';
import { unrestIndex } from './seismology/unrestIndex';
import { accumulateRegionEnergy, dominantRegion } from './seismology/regionDominance';
import { classifyTectonicRegion } from './seismology/tectonicRegion';
import { listPresets, savePreset, deletePreset } from './lib/presetsStore';
import type { PresetSource } from './lib/presetsStore';
import { buildShareUrl, readShareParamsFromLocation } from './lib/shareLink';
import { copyToClipboard } from './lib/clipboard';
import {
  hasSeenOnboarding, loadStoredMix, loadStoredThreshold, loadStoredVolume, markOnboardingSeen,
  saveStoredMix, saveStoredThreshold, saveStoredVolume,
} from './lib/localSettings';
import { Helicorder } from './components/Helicorder';
import { ScopePanel } from './components/ScopePanel';
import { OnboardingHint } from './components/OnboardingHint';
import { ConsoleRack, type SimState } from './components/ConsoleRack';
import { StatusPanel } from './components/StatusPanel';
import { PresetsModal } from './components/PresetsModal';
import type { EngineConfig, Preset, Quake, TectonicRegion } from './types';
import './App.css';

interface TrackedQuake extends Quake {
  region: TectonicRegion;
}

const DEFAULT_SIM: SimState = { magnitude: 5.5, depthKm: 20, region: 'ring-of-fire' };
const DEFAULT_MIX: Record<MixLayer, number> = { drone: 1, trigger: 1, aftershock: 1 };
const MAX_TRACKED_EVENTS = 500;
const EVENT_RETENTION_MS = 8 * 60 * 60 * 1000; // ~4 unrest half-lives; older events are negligible

// Representative coordinates for the four coarse tectonic provinces, used
// only by Simulate mode to place synthetic quakes somewhere that actually
// classifies into the region the user picked.
const SIM_REGION_COORDS: Record<TectonicRegion, { lon: number; lat: number }> = {
  'ring-of-fire': { lon: 139.69, lat: 35.69 }, // Tokyo
  'alpide-belt': { lon: 28.98, lat: 41.01 }, // Istanbul
  'mid-atlantic-ridge': { lon: -21.9, lat: 64.15 }, // Reykjavik
  'intraplate-other': { lon: -97.34, lat: 37.68 }, // Wichita, Kansas
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

let simIdCounter = 0;
function nextSimId(): string {
  simIdCounter += 1;
  return `sim-${Date.now()}-${simIdCounter}`;
}

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();

  const mainRegionRef = useRef<HTMLDivElement>(null);
  const presetsButtonRef = useRef<HTMLButtonElement>(null);
  const presetsModalHasMounted = useRef(false);

  const [started, setStarted] = useState(false);
  const [volume, setVolume] = useState(() => loadStoredVolume(0.8));
  const [simulate, setSimulate] = useState(false);
  const [sim, setSim] = useState<SimState>(DEFAULT_SIM);
  const [mix, setMix] = useState<Record<MixLayer, number>>(() => loadStoredMix(DEFAULT_MIX));
  const [magnitudeThreshold, setMagnitudeThreshold] = useState(() => loadStoredThreshold(4.5));
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsSource, setPresetsSource] = useState<PresetSource>('server');
  const [presetName, setPresetName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [events, setEvents] = useState<TrackedQuake[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const seenIdsRef = useRef<Set<string>>(new Set());
  const thresholdRef = useRef(magnitudeThreshold);
  thresholdRef.current = magnitudeThreshold;
  const startedRef = useRef(started);
  startedRef.current = started;

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    markOnboardingSeen();
  };

  useWakeLock(started);

  // A shared threshold in the URL is applied once on load, same idea as
  // Petrichor's share-link mechanism, then the URL is cleaned up so a
  // refresh doesn't reapply it.
  useEffect(() => {
    const shared = readShareParamsFromLocation();
    if (shared) {
      setMagnitudeThreshold(shared.magnitudeThreshold);
      saveStoredThreshold(shared.magnitudeThreshold);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // The Presets dialog is a real modal: the rest of the console is made
  // `inert` while it's open, and focus moves in on open / back to the
  // triggering button on close — the same "only one region is reachable at
  // a time" idea the old Monitor drawer used, but scoped to an actual
  // dialog instead of a permanently-hidden control surface.
  useEffect(() => {
    if (mainRegionRef.current) mainRegionRef.current.inert = presetsOpen;

    if (!presetsModalHasMounted.current) {
      presetsModalHasMounted.current = true;
      return;
    }
    if (!presetsOpen) presetsButtonRef.current?.focus();
  }, [presetsOpen]);

  // Ticks once a second so the unrest index keeps cooling down in real time
  // even when no new quakes arrive — it has real temporal memory, not just
  // an instantaneous snapshot.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ingestQuakes = useCallback((incoming: Quake[]) => {
    if (incoming.length === 0) return;
    const tracked: TrackedQuake[] = incoming.map((q) => ({ ...q, region: classifyTectonicRegion(q.lon, q.lat) }));

    setEvents((prev) => {
      const merged = [...prev, ...tracked];
      const cutoff = Date.now() - EVENT_RETENTION_MS;
      const pruned = merged.filter((e) => (e.time ?? 0) >= cutoff);
      return pruned.length > MAX_TRACKED_EVENTS ? pruned.slice(pruned.length - MAX_TRACKED_EVENTS) : pruned;
    });

    if (startedRef.current) {
      incoming.filter((q) => q.mag >= thresholdRef.current).forEach((q) => engineRef.current?.triggerQuake(q));
    }
  }, []);

  // Live USGS feed, ignored while Simulate mode is active.
  const { quakes: liveQuakes } = useQuakeFeed();
  useEffect(() => {
    if (simulate) return;
    const fresh = liveQuakes.filter((q) => !seenIdsRef.current.has(q.id));
    if (fresh.length === 0) return;
    fresh.forEach((q) => seenIdsRef.current.add(q.id));
    ingestQuakes(fresh);
  }, [liveQuakes, simulate, ingestQuakes]);

  const unrestEvents = useMemo(() => events.map((e) => ({ magnitude: e.mag, timeMs: e.time ?? nowMs })), [events]);
  const regionEvents = useMemo(
    () => events.map((e) => ({ region: e.region, magnitude: e.mag, timeMs: e.time ?? nowMs })),
    [events],
  );

  const unrest = useMemo(() => unrestIndex(unrestEvents, nowMs), [unrestEvents, nowMs]);
  const regionEnergy = useMemo(() => accumulateRegionEnergy(regionEvents, nowMs), [regionEvents, nowMs]);
  const dominant = useMemo(() => dominantRegion(regionEnergy), [regionEnergy]);
  const droneParams = useMemo(() => mapUnrestToParams(unrest, dominant), [unrest, dominant]);

  const lastQuake = events.length > 0 ? events[events.length - 1] : null;

  const getRecordingStream = useCallback(() => engineRef.current?.getRecordingStream() ?? null, []);
  const recorder = useRecorder(getRecordingStream);

  useEffect(() => {
    engineRef.current?.updateDroneParams(droneParams);
  }, [droneParams]);

  useEffect(() => {
    engineRef.current?.setMasterVolume(volume);
    saveStoredVolume(volume);
  }, [volume]);

  useEffect(() => {
    listPresets().then(({ presets: loaded, source }) => {
      setPresets(loaded);
      setPresetsSource(source);
    });
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
    },
    [],
  );

  const handleStart = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start();
    engine.setMasterVolume(volume);
    engine.updateDroneParams(droneParams);
    Object.entries(mix).forEach(([layer, level]) => engine.setMixLevel(layer as MixLayer, level));
    setStarted(true);
    if (showOnboarding) dismissOnboarding();
  };

  const handleStop = () => {
    if (recorder.isRecording) recorder.stop();
    engineRef.current?.stop();
    setStarted(false);
  };

  const handleStartRef = useRef(handleStart);
  const handleStopRef = useRef(handleStop);
  handleStartRef.current = handleStart;
  handleStopRef.current = handleStop;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
      e.preventDefault();
      if (started) handleStopRef.current();
      else handleStartRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started]);

  useMediaSession(
    started,
    { title: `Unrest ${Math.round(unrest * 100)}% · Threshold M${magnitudeThreshold.toFixed(1)}`, artist: 'Fault Line' },
    handleStart,
    handleStop,
  );

  const handleMixChange = (layer: MixLayer, level: number) => {
    setMix((prev) => {
      const next = { ...prev, [layer]: level };
      saveStoredMix(next);
      return next;
    });
    engineRef.current?.setMixLevel(layer, level);
  };

  const handleThresholdChange = (value: number) => {
    setMagnitudeThreshold(value);
    saveStoredThreshold(value);
  };

  const buildSimQuake = (): Quake => {
    const coords = SIM_REGION_COORDS[sim.region];
    const jitterLon = (Math.random() - 0.5) * 3;
    const jitterLat = (Math.random() - 0.5) * 3;
    return {
      id: nextSimId(),
      mag: clamp(sim.magnitude, 2, 9.5),
      place: `Simulated · ${sim.region}`,
      time: Date.now(),
      updated: Date.now(),
      tsunami: 0,
      sig: Math.round(sim.magnitude * 120),
      alert: null,
      type: 'earthquake',
      lon: clamp(coords.lon + jitterLon, -180, 180),
      lat: clamp(coords.lat + jitterLat, -85, 85),
      depthKm: Math.max(0, sim.depthKm),
    };
  };

  const handleTriggerOne = () => {
    ingestQuakes([buildSimQuake()]);
  };

  const handleTriggerSwarm = () => {
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const magJitter = clamp(sim.magnitude + (Math.random() - 0.5) * 1.4, 2, 9.5);
      const depthJitter = Math.max(0, sim.depthKm + (Math.random() - 0.5) * 60);
      const quake: Quake = { ...buildSimQuake(), mag: magJitter, depthKm: depthJitter };
      setTimeout(() => ingestQuakes([{ ...quake, time: Date.now() }]), i * (300 + Math.random() * 400));
    }
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    const config: EngineConfig = { magnitudeThreshold };
    const { preset, source } = await savePreset(name, config);
    setPresets((prev) => [...prev.filter((p) => p.name !== name), preset]);
    setPresetsSource(source);
    setPresetName('');
  };

  const handleLoadPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (preset) {
      setMagnitudeThreshold(preset.params.magnitudeThreshold);
      saveStoredThreshold(preset.params.magnitudeThreshold);
    }
  };

  const handleDeletePreset = async (name: string) => {
    const { source } = await deletePreset(name);
    setPresets((prev) => prev.filter((p) => p.name !== name));
    setPresetsSource(source);
  };

  const handleCopyShareLink = async () => {
    const ok = await copyToClipboard(buildShareUrl({ magnitudeThreshold }));
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const scopeQuakes = useMemo(
    () => events.map((e) => ({ id: e.id, lon: e.lon, lat: e.lat, mag: e.mag, depthKm: e.depthKm })),
    [events],
  );

  return (
    <div className="console-app">
      <div ref={mainRegionRef} className="console-main">
        <header className="console-header">
          <span className="console-brand">FAULT LINE</span>
          <span className="console-brand-sub">Seismograph Console</span>
        </header>

        <div className="console-grid">
          <section className="helicorder-bay" aria-label="Live waveform">
            {showOnboarding && <OnboardingHint onDismiss={dismissOnboarding} />}
            <Helicorder analyser={engineRef.current.getAnalyser()} active={started} />
          </section>

          <aside className="side-bay">
            <ScopePanel quakes={scopeQuakes} unrest={unrest} />
            <StatusPanel
              unrest={unrest}
              dominantRegion={dominant}
              params={droneParams}
              quakeCount={events.length}
              lastQuake={lastQuake}
            />
          </aside>
        </div>

        <ConsoleRack
          unrest={unrest}
          dominantRegion={dominant}
          lastQuake={lastQuake}
          started={started}
          onStart={handleStart}
          onStop={handleStop}
          volume={volume}
          onVolumeChange={setVolume}
          isRecording={recorder.isRecording}
          recordingUrl={recorder.recordingUrl}
          recordingError={recorder.error}
          onStartRecording={recorder.start}
          onStopRecording={recorder.stop}
          simulate={simulate}
          onToggleSimulate={setSimulate}
          sim={sim}
          onSimChange={(patch) => setSim((prev) => ({ ...prev, ...patch }))}
          onTriggerOne={handleTriggerOne}
          onTriggerSwarm={handleTriggerSwarm}
          magnitudeThreshold={magnitudeThreshold}
          onThresholdChange={handleThresholdChange}
          mix={mix}
          onMixChange={handleMixChange}
          onOpenPresets={() => setPresetsOpen(true)}
          presetsButtonRef={presetsButtonRef}
        />
      </div>

      {presetsOpen && (
        <PresetsModal
          presets={presets}
          presetsSource={presetsSource}
          presetName={presetName}
          onPresetNameChange={setPresetName}
          onSavePreset={handleSavePreset}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={handleDeletePreset}
          onCopyShareLink={handleCopyShareLink}
          linkCopied={linkCopied}
          onClose={() => setPresetsOpen(false)}
        />
      )}
    </div>
  );
}
