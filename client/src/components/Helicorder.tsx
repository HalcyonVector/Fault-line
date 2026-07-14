import { useEffect, useRef } from 'react';
import type * as Tone from 'tone';
import { pushSample, peakAmplitude, amplitudeToTraceY, traceSampleIntervalMs, decimateForWidth } from '../helicorder/traceBuffer';

interface HelicorderProps {
  analyser: Tone.Analyser | null;
  active: boolean;
}

const MAX_SAMPLES = 900; // ~ a few minutes of trace history at the base sample rate
const BASE_SAMPLE_INTERVAL_MS = 40;
const GAIN = 3.2;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * The hero instrument: a scrolling helicorder / strip-chart trace, driven by
 * a real Tone.Analyser tapped off the AudioEngine's master bus (see
 * AudioEngine.getAnalyser) — the drone and every triggered P/S onset visibly
 * move this line, it is not a decorative fake animation. History is kept in
 * a ring buffer (helicorder/traceBuffer.ts) so the trace scrolls right-to-left
 * like real seismograph station output rather than just replaying the
 * instantaneous waveform shape every frame.
 */
export function Helicorder({ analyser, active }: HelicorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const bufferRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = prefersReducedMotion();
    const sampleInterval = traceSampleIntervalMs(BASE_SAMPLE_INTERVAL_MS, reduced);

    const draw = (timestamp: number) => {
      const { width, height } = canvas;
      const centerY = height / 2;

      if (active && analyser) {
        if (timestamp - lastSampleAtRef.current >= sampleInterval) {
          lastSampleAtRef.current = timestamp;
          const values = analyser.getValue() as Float32Array;
          const peak = peakAmplitude(values);
          bufferRef.current = pushSample(bufferRef.current, peak, MAX_SAMPLES);
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Graph-paper grid, phosphor-monitor style.
      ctx.strokeStyle = 'rgba(226, 110, 88, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = width; gx > 0; gx -= 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.strokeStyle = 'rgba(226, 110, 88, 0.14)';
      ctx.stroke();

      const columns = decimateForWidth(bufferRef.current, width);
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = active ? 'rgba(255, 143, 107, 0.92)' : 'rgba(226, 110, 88, 0.28)';
      const maxOffset = height * 0.46;
      columns.forEach((col, i) => {
        const yMax = amplitudeToTraceY(col.max, centerY, GAIN, maxOffset);
        const yMin = amplitudeToTraceY(col.min, centerY, GAIN, maxOffset);
        // Draw a vertical hairline spanning min..max per column — the same
        // envelope-drawing approach real DAW/strip-chart renderers use so
        // fast transients (P/S onsets) are never lost to a naive polyline.
        ctx.moveTo(i, yMax);
        ctx.lineTo(i, yMin);
      });
      ctx.stroke();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={320}
      className="helicorder"
      role="img"
      aria-label={active ? 'Live seismic waveform trace' : 'Seismic waveform trace, engine stopped'}
    />
  );
}
