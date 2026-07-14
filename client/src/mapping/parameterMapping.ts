import type { Quake, SeismicParams, TectonicRegion, TriggerParams } from '../types';
import { magnitudeToAmplitude, depthToFilterCutoffHz, depthToEnvelope } from '../seismology/energyMapping';
import { computeSPDelay } from '../seismology/spDelay';
import { generateAftershockTrain } from '../seismology/omoriAftershocks';
import { classifyTectonicRegion } from '../seismology/tectonicRegion';
import { regionColorFor } from '../audio/seismicTheory';

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t);
}

const MAX_DRONE_LAYERS = 5;

/**
 * Pure function: the rolling unrest index (+ which tectonic region is
 * currently dominant) in, the drone's fully-resolved continuous synthesis
 * parameters out. This is the seismic analog of Petrichor's
 * mapInputsToParams — everything the background "global seismic
 * restlessness" layer sounds like is decided here, not scattered through
 * the audio engine.
 */
export function mapUnrestToParams(unrest: number, dominantRegion: TectonicRegion | null): SeismicParams {
  const u = clamp(unrest);
  const color = regionColorFor(dominantRegion, u);

  return {
    droneDensity: clamp(0.12 + u * 0.88),
    layerCount: 1 + Math.round(u * (MAX_DRONE_LAYERS - 1)),
    dissonance: u,
    filterCutoffHz: lerp(2200, 450, u), // calm = brighter/open, unrest = closing in, more resonant/muffled
    filterResonance: lerp(0.6, 9, u),
    tremoloRate: lerp(0.08, 5.5, u), // faster beating/tremolo as unrest rises
    overtoneColor: color.overtoneColor,
    warmth: color.warmth,
    vignette: u,
    dominantRegion,
  };
}

/**
 * Pure function: a single incoming quake in, its trigger-event synthesis
 * parameters out (amplitude/brightness from magnitude+depth, the P/S onset
 * gap, an Omori aftershock echo train when significant, and its tectonic
 * region for timbral coloring). No side effects, no Tone.js — the
 * AudioEngine just plays back whatever this resolves to.
 */
export function mapQuakeToTriggerParams(quake: Quake): TriggerParams {
  const { attack, decay } = depthToEnvelope(quake.depthKm);
  return {
    amplitude: magnitudeToAmplitude(quake.mag),
    cutoffHz: depthToFilterCutoffHz(quake.depthKm),
    attack,
    decay,
    spDelayMs: computeSPDelay(quake.depthKm),
    aftershocks: generateAftershockTrain(quake.mag, quake.sig),
    region: classifyTectonicRegion(quake.lon, quake.lat),
  };
}
