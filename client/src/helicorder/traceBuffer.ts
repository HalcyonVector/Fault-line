/**
 * Pure math for the helicorder's scrolling trace buffer. Kept dependency-free
 * and DOM-free (same testing philosophy as seismology/*) so the ring-buffer
 * bookkeeping and amplitude shaping can be unit-tested independently of the
 * canvas/Tone.Analyser plumbing that lives in components/Helicorder.tsx.
 */

/** Appends `value` to `buffer`, keeping at most `maxLength` most-recent samples (a fixed-size ring, oldest-first). */
export function pushSample(buffer: readonly number[], value: number, maxLength: number): number[] {
  if (maxLength <= 0) return [];
  const next = buffer.length >= maxLength ? buffer.slice(buffer.length - maxLength + 1) : buffer.slice();
  next.push(value);
  return next;
}

/** Peak (max absolute value) across a waveform snapshot — one scalar "sample" per animation frame for the strip chart. */
export function peakAmplitude(values: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < values.length; i++) {
    const abs = Math.abs(values[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/** Maps a signed -1..1 amplitude sample to a pixel Y offset around `centerY`, clamped to +/-`maxOffset`. */
export function amplitudeToTraceY(amplitude: number, centerY: number, gain: number, maxOffset: number): number {
  const clamped = Math.max(-1, Math.min(1, amplitude * gain));
  return centerY - clamped * maxOffset;
}

/** How often (ms) a new column should be pushed into the trace, slowed down under `prefers-reduced-motion` rather than frozen outright. */
export function traceSampleIntervalMs(baseIntervalMs: number, reducedMotion: boolean, slowFactor = 4): number {
  return reducedMotion ? baseIntervalMs * Math.max(1, slowFactor) : baseIntervalMs;
}

/**
 * Reduces a longer sample buffer down to at most `targetWidth` columns using
 * min/max peak-pair decimation (the same technique real waveform/DAW strip
 * charts use), so a trace with more history than pixels still shows the true
 * envelope instead of being naively subsampled and losing transients.
 */
export function decimateForWidth(buffer: readonly number[], targetWidth: number): { min: number; max: number }[] {
  if (targetWidth <= 0 || buffer.length === 0) return [];
  if (buffer.length <= targetWidth) {
    return buffer.map((v) => ({ min: v, max: v }));
  }
  const bucketSize = buffer.length / targetWidth;
  const out: { min: number; max: number }[] = [];
  for (let i = 0; i < targetWidth; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j < end && j < buffer.length; j++) {
      if (buffer[j] < min) min = buffer[j];
      if (buffer[j] > max) max = buffer[j];
    }
    out.push({ min, max });
  }
  return out;
}
