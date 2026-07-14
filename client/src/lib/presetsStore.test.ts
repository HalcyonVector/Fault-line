import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listPresets, savePreset, deletePreset } from './presetsStore';
import type { EngineConfig } from '../types';

const PARAMS: EngineConfig = { magnitudeThreshold: 4.5 };

function stubUnreachableBackend() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network down');
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listPresets', () => {
  it('returns server presets with source "server" when the backend responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ name: 'a', params: PARAMS, savedAt: '2026-01-01T00:00:00.000Z' }],
      })),
    );

    const { presets, source } = await listPresets();
    expect(source).toBe('server');
    expect(presets).toHaveLength(1);
  });

  it('falls back to localStorage (empty) when the backend is unreachable', async () => {
    stubUnreachableBackend();

    const { presets, source } = await listPresets();
    expect(source).toBe('local');
    expect(presets).toEqual([]);
  });
});

describe('savePreset', () => {
  it('saves to localStorage when the backend is unreachable, and listPresets picks it up', async () => {
    stubUnreachableBackend();

    const { preset, source } = await savePreset('swarm-watch', PARAMS);
    expect(source).toBe('local');
    expect(preset.name).toBe('swarm-watch');

    const { presets } = await listPresets();
    expect(presets.map((p) => p.name)).toEqual(['swarm-watch']);
  });

  it('overwrites a local preset saved again under the same name', async () => {
    stubUnreachableBackend();

    await savePreset('dup', { magnitudeThreshold: 3 });
    await savePreset('dup', { magnitudeThreshold: 6 });

    const { presets } = await listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].params.magnitudeThreshold).toBe(6);
  });
});

describe('deletePreset', () => {
  it('removes a locally-saved preset', async () => {
    stubUnreachableBackend();

    await savePreset('temp', PARAMS);
    await deletePreset('temp');

    const { presets } = await listPresets();
    expect(presets).toEqual([]);
  });
});
