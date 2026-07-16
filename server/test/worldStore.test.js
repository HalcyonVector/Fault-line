import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;
let fileCounter = 0;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fault-line-worldstore-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.WORLD_DATA_FILE;
});

// Fresh module registry per test so each gets its own DATA_FILE constant and
// its own independent `lockTail` queue, mirroring world.test.js's isolation.
async function freshStore() {
  fileCounter += 1;
  const dataFile = path.join(tmpDir, `world-${fileCounter}.json`);
  process.env.WORLD_DATA_FILE = dataFile;
  vi.resetModules();
  const mod = await import('../src/lib/worldStore.js');
  return { ...mod, dataFile };
}

describe('readWorld', () => {
  it('returns a fresh world when the file does not exist yet', async () => {
    const { readWorld } = await freshStore();
    const world = await readWorld();
    expect(world.budget.value).toBe(100);
    expect(world.ledger).toEqual([]);
    expect(Object.keys(world.sites).length).toBeGreaterThan(0);
  });

  it('recovers a fresh world instead of throwing when the file contains invalid JSON', async () => {
    const { readWorld, dataFile } = await freshStore();
    writeFileSync(dataFile, '{"sites": {"tokyo": {"resilience": 5', 'utf-8'); // truncated, invalid JSON

    const world = await readWorld();
    expect(world.budget.value).toBe(100);
    expect(world.ledger).toEqual([]);
  });

  it('recovers a fresh world instead of throwing when the file is empty', async () => {
    const { readWorld, dataFile } = await freshStore();
    writeFileSync(dataFile, '', 'utf-8');

    const world = await readWorld();
    expect(world.budget.value).toBe(100);
  });
});

describe('writeWorld', () => {
  it('round-trips through readWorld and leaves no leftover temp file', async () => {
    const { readWorld, writeWorld, dataFile } = await freshStore();
    const world = await readWorld();
    world.budget.value = 42;
    await writeWorld(world);

    const reloaded = await readWorld();
    expect(reloaded.budget.value).toBe(42);

    const leftovers = readdirSync(path.dirname(dataFile)).filter((f) => f.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });
});

describe('transact', () => {
  it('serializes concurrent calls so no update is lost to a read/write race', async () => {
    const { transact, readWorld } = await freshStore();

    // 20 concurrent "increment budget by 1" transactions. If transact didn't
    // serialize the underlying read-modify-write, overlapping calls would
    // each read the same stale value and stomp on each other, losing updates
    // (and, in the original bug, occasionally catching the file mid-write).
    await Promise.all(
      Array.from({ length: 20 }, () =>
        transact((world) => {
          world.budget.value += 1;
        }),
      ),
    );

    const final = await readWorld();
    expect(final.budget.value).toBe(120); // starts at 100 + 20 increments
  });

  it('still persists the mutation even when the mutator returns an error-shaped result', async () => {
    const { transact, readWorld } = await freshStore();

    const result = await transact((world) => {
      world.budget.value -= 1; // e.g. a partial side effect that should still be saved
      return { status: 400, body: { error: 'rejected' } };
    });

    expect(result.status).toBe(400);
    const world = await readWorld();
    expect(world.budget.value).toBe(99);
  });
});
