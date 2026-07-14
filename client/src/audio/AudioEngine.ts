import * as Tone from 'tone';
import { intervalPaletteForUnrest } from './seismicTheory';
import { mapQuakeToTriggerParams } from '../mapping/parameterMapping';
import type { Quake, SeismicParams } from '../types';

export type MixLayer = 'drone' | 'trigger' | 'aftershock';

const DRONE_ROOT_HZ = 55; // A1 — a low, tense drone root
const MAX_DRONE_LAYERS = 5;
const DRONE_BASE_GAIN = 0.5;

const DEFAULT_PARAMS: SeismicParams = {
  droneDensity: 0.15,
  layerCount: 1,
  dissonance: 0,
  filterCutoffHz: 2200,
  filterResonance: 0.6,
  tremoloRate: 0.08,
  overtoneColor: 0.15,
  warmth: 0.55,
  vignette: 0,
  dominantRegion: null,
};

/**
 * The synthesis engine: a bank of oscillator drone layers (background
 * "global seismic restlessness") plus a discrete per-quake trigger built
 * from a quiet P click, a stronger depth-shaped S arrival some physically
 * computed milliseconds later, and — for significant quakes — a quiet
 * Omori-law aftershock echo train. Everything here is oscillators, noise,
 * filters, and envelopes; there is no sample playback anywhere.
 */
export class AudioEngine {
  private params: SeismicParams = DEFAULT_PARAMS;
  private started = false;
  private built = false;
  private mixLevels: Record<MixLayer, number> = { drone: 1, trigger: 1, aftershock: 1 };

  private master!: Tone.Gain;
  private analyser!: Tone.Analyser;
  private reverb!: Tone.Reverb;

  // Drone
  private droneMaster!: Tone.Gain;
  private droneFilter!: Tone.Filter;
  private droneTremolo!: Tone.Tremolo;
  private oscA: Tone.Oscillator[] = []; // warm fundamental per layer
  private oscB: Tone.Oscillator[] = []; // metallic overtone partial per layer
  private layerGains: Tone.Gain[] = [];
  private overtoneGains: Tone.Gain[] = [];

  // Trigger (P/S onset)
  private pClick!: Tone.NoiseSynth;
  private pClickFilter!: Tone.Filter;
  private sArrival!: Tone.MonoSynth;

  // Omori aftershock echoes
  private aftershockSynth!: Tone.PluckSynth;

  private recordingDestination?: MediaStreamAudioDestinationNode;

  /** Builds the audio graph. Safe to call before Tone.start() — nodes just sit silent. */
  private build() {
    if (this.built) return;
    this.built = true;

    this.master = new Tone.Gain(0.85).toDestination();
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.master.connect(this.analyser);

    this.reverb = new Tone.Reverb({ decay: 7, wet: 0.3, preDelay: 0.03 });
    this.reverb.connect(this.master);

    // --- Drone layer ---
    this.droneFilter = new Tone.Filter({ frequency: DEFAULT_PARAMS.filterCutoffHz, type: 'lowpass', rolloff: -24, Q: DEFAULT_PARAMS.filterResonance });
    this.droneFilter.connect(this.reverb);

    this.droneTremolo = new Tone.Tremolo({ frequency: DEFAULT_PARAMS.tremoloRate, depth: 0.45 }).connect(this.droneFilter);
    this.droneTremolo.start();

    this.droneMaster = new Tone.Gain(0).connect(this.droneTremolo);

    for (let i = 0; i < MAX_DRONE_LAYERS; i++) {
      const layerGain = new Tone.Gain(0).connect(this.droneMaster);
      const overtoneGain = new Tone.Gain(0).connect(layerGain);

      const warm = new Tone.Oscillator({ frequency: DRONE_ROOT_HZ, type: 'sine' });
      warm.connect(layerGain);
      warm.start();

      // A partial-rich waveform (extra harmonics baked into the type itself)
      // stands in for a "metallic FM-ish" overtone layer without needing a
      // full FM-synthesis voice — Tone's plain Oscillator only accepts
      // basic/partial waveform types, not the fm* types (those are
      // OmniOscillator-only).
      const metallic = new Tone.Oscillator({ frequency: DRONE_ROOT_HZ * 2, type: 'square4' });
      metallic.connect(overtoneGain);
      metallic.start();

      this.oscA.push(warm);
      this.oscB.push(metallic);
      this.layerGains.push(layerGain);
      this.overtoneGains.push(overtoneGain);
    }

    // --- Trigger: P click (quiet, sharp, high) ---
    this.pClickFilter = new Tone.Filter({ frequency: 4000, type: 'highpass', rolloff: -12 });
    this.pClickFilter.connect(this.reverb);
    this.pClick = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    });
    this.pClick.connect(this.pClickFilter);

    // --- Trigger: S arrival (stronger, depth-shaped) ---
    this.sArrival = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.6, sustain: 0.05, release: 0.6 },
      filter: { type: 'lowpass', rolloff: -24 },
      filterEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8, baseFrequency: 200, octaves: 3 },
    });
    this.sArrival.connect(this.reverb);

    // --- Omori aftershock echoes ---
    this.aftershockSynth = new Tone.PluckSynth({ attackNoise: 0.4, dampening: 2200, resonance: 0.72 });
    this.aftershockSynth.connect(this.reverb);

    this.applyDroneParams(this.params);
  }

  async start() {
    this.build();
    if (this.started) return;
    await Tone.start();
    this.started = true;
  }

  stop() {
    this.started = false;
  }

  isStarted() {
    return this.started;
  }

  getAnalyser(): Tone.Analyser | null {
    return this.built ? this.analyser : null;
  }

  setMasterVolume(linear01: number) {
    if (!this.built) return;
    this.master.gain.rampTo(Math.max(0, Math.min(1, linear01)), 0.2);
  }

  /** Per-layer mix control (drone / trigger / aftershock), independent of the live unrest-driven mapping. */
  setMixLevel(layer: MixLayer, level: number) {
    this.mixLevels[layer] = Math.max(0, Math.min(1.5, level));
    if (layer === 'drone' && this.built) {
      this.droneMaster.gain.rampTo(this.params.droneDensity * DRONE_BASE_GAIN * this.mixLevels.drone, 0.3);
    }
  }

  /**
   * Taps the master bus into a MediaStreamAudioDestinationNode so the live
   * output can be recorded with MediaRecorder. Created lazily, reused.
   */
  getRecordingStream(): MediaStream | null {
    if (!this.built) return null;
    if (!this.recordingDestination) {
      const rawContext = Tone.getContext().rawContext as unknown as AudioContext;
      this.recordingDestination = rawContext.createMediaStreamDestination();
      this.master.connect(this.recordingDestination);
    }
    return this.recordingDestination.stream;
  }

  /** Continuously reshapes the background drone from the resolved unrest/region params. Never restarts anything. */
  updateDroneParams(params: SeismicParams) {
    this.params = params;
    if (!this.built) return;
    this.applyDroneParams(params);
  }

  private applyDroneParams(params: SeismicParams) {
    this.droneFilter.frequency.rampTo(params.filterCutoffHz, 3);
    this.droneFilter.Q.rampTo(params.filterResonance, 3);
    this.droneTremolo.frequency.rampTo(Math.max(0.01, params.tremoloRate), 2);
    this.droneMaster.gain.rampTo(params.droneDensity * DRONE_BASE_GAIN * this.mixLevels.drone, 3);
    this.reverb.wet.rampTo(0.22 + params.dissonance * 0.35, 3);

    const intervals = intervalPaletteForUnrest(params.dissonance);
    const detuneSpread = 6 + (1 - params.warmth) * 30;

    for (let i = 0; i < MAX_DRONE_LAYERS; i++) {
      const active = i < params.layerCount;
      const target = active ? 1 / params.layerCount : 0;
      this.layerGains[i].gain.rampTo(target, 4);
      this.overtoneGains[i].gain.rampTo(active ? params.overtoneColor * 0.6 : 0, 3);

      const semitoneIndex = i % intervals.length;
      const octaveBump = Math.floor(i / intervals.length) * 12;
      const semitone = intervals[semitoneIndex] + octaveBump;
      const freq = DRONE_ROOT_HZ * Math.pow(2, semitone / 12);

      this.oscA[i].frequency.rampTo(freq, 4);
      this.oscA[i].detune.rampTo((i - Math.floor(MAX_DRONE_LAYERS / 2)) * detuneSpread, 4);
      this.oscB[i].frequency.rampTo(freq * 2.003, 4); // slightly detuned octave partial for shimmer/beating
    }
  }

  /**
   * Fires the discrete two-stage onset for a single incoming quake: a quiet
   * P click immediately, then a stronger, depth-timbred S arrival after the
   * physically-computed P-S gap (see seismology/spDelay.ts), followed by a
   * quiet Omori aftershock echo train for significant quakes. Below the
   * user's magnitude threshold this is simply never called.
   */
  triggerQuake(quake: Quake) {
    if (!this.built || !this.started) return;
    const trigger = mapQuakeToTriggerParams(quake);
    const now = Tone.now();

    // P wave: quiet, sharp, essentially instantaneous.
    this.pClickFilter.frequency.setValueAtTime(Math.max(1800, trigger.cutoffHz), now);
    this.pClick.volume.value = Tone.gainToDb(Math.max(0.015, 0.12 * trigger.amplitude * this.mixLevels.trigger));
    this.pClick.triggerAttackRelease('32n', now);

    // S wave: stronger, shaped by depth, arriving after the real P-S gap.
    const sTime = now + trigger.spDelayMs / 1000 + 0.008;
    const noteHz = Math.max(45, Math.min(320, trigger.cutoffHz * 0.14));
    this.sArrival.set({
      envelope: { attack: trigger.attack, decay: trigger.decay, sustain: 0.05, release: trigger.decay * 0.6 },
      filterEnvelope: {
        attack: trigger.attack,
        decay: trigger.decay,
        baseFrequency: Math.max(50, trigger.cutoffHz * 0.4),
        octaves: 3,
      },
    });
    this.sArrival.volume.value = Tone.gainToDb(Math.max(0.05, trigger.amplitude * this.mixLevels.trigger));
    this.sArrival.triggerAttackRelease(noteHz, Math.max(0.25, trigger.decay + 0.4), sTime);

    // Omori aftershock echoes: a quiet, decaying train after the S arrival.
    trigger.aftershocks.forEach((pulse) => {
      const t = sTime + pulse.delayMs / 1000;
      const level = Math.max(0.004, pulse.amplitude * trigger.amplitude * this.mixLevels.aftershock);
      this.aftershockSynth.volume.setValueAtTime(Tone.gainToDb(level), t);
      this.aftershockSynth.triggerAttackRelease(noteHz * 0.6, t);
    });
  }

  dispose() {
    this.stop();
    if (!this.built) return;
    if (this.recordingDestination) {
      this.master.disconnect(this.recordingDestination);
      this.recordingDestination = undefined;
    }
    [
      this.master, this.analyser, this.reverb,
      this.droneMaster, this.droneFilter, this.droneTremolo,
      ...this.oscA, ...this.oscB, ...this.layerGains, ...this.overtoneGains,
      this.pClick, this.pClickFilter, this.sArrival, this.aftershockSynth,
    ].forEach((node) => node?.dispose());
    this.built = false;
  }
}
