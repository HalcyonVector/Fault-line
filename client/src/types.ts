/** A single normalized earthquake event, as served by GET /api/quakes. */
export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number | null; // ms epoch
  updated: number | null;
  tsunami: number;
  sig: number;
  alert: string | null;
  type: string;
  lon: number;
  lat: number;
  depthKm: number;
}

export type TectonicRegion = 'ring-of-fire' | 'alpide-belt' | 'mid-atlantic-ridge' | 'intraplate-other';

/** A pulse in a synthesized Omori-law aftershock echo train. */
export interface AftershockPulse {
  delayMs: number;
  amplitude: number;
}

/** The continuous, fully-resolved drone/background synthesis parameters — the seismic analog of Petrichor's AmbientParams. */
export interface SeismicParams {
  droneDensity: number; // 0..1, overall thickness of the drone layer
  layerCount: number; // 1..5, simultaneous drone oscillator layers
  dissonance: number; // 0..1, drives interval palette selection (open fifths -> minor second/tritone clusters)
  filterCutoffHz: number;
  filterResonance: number; // Q
  tremoloRate: number; // Hz, beating/tremolo speed
  overtoneColor: number; // 0..1, metallic FM-ish overtone amount (tectonic-region driven)
  warmth: number; // 0..1, lower = colder/sparser (tectonic-region driven)
  vignette: number; // 0..1, visual darkening/reddening — mirrors unrest
  dominantRegion: TectonicRegion | null;
}

/** Per-quake trigger synthesis parameters, resolved from magnitude/depth/location. */
export interface TriggerParams {
  amplitude: number; // 0..1
  cutoffHz: number; // depth-driven timbral brightness
  attack: number; // seconds
  decay: number; // seconds
  spDelayMs: number; // P-to-S onset gap
  aftershocks: AftershockPulse[];
  region: TectonicRegion;
}

export interface QuakeFeedResponse {
  quakes: Quake[];
  feed: string;
  fetchedAt: string;
  cached: boolean;
}

export interface EngineConfig {
  magnitudeThreshold: number; // 2.5..7.5
}

export interface Preset {
  name: string;
  params: EngineConfig;
  savedAt: string;
}
