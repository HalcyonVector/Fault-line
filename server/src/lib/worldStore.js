// Flat-JSON-file-backed persistence for the shared world/ledger state, same
// pattern the old presets store used: read/write a single JSON file, with an
// env var override so tests can isolate their own throwaway copy instead of
// touching the real data file.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from './sites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = process.env.WORLD_DATA_FILE
  ? path.resolve(process.env.WORLD_DATA_FILE)
  : path.join(DATA_DIR, 'world.json');

const STARTING_RESILIENCE = 20;
const BUDGET_CAP = 100;
const BUDGET_REGEN_PER_HOUR = 1;

function freshWorld() {
  const sites = {};
  for (const site of SITES) {
    sites[site.id] = { resilience: STARTING_RESILIENCE, health: 100 };
  }
  return {
    sites,
    budget: { value: 100, cap: BUDGET_CAP, regenPerHour: BUDGET_REGEN_PER_HOUR, lastRegenAt: new Date().toISOString() },
    ledger: [],
    processedQuakeIds: [],
    activeAftershockWindow: null,
  };
}

export async function readWorld() {
  let raw;
  try {
    raw = await readFile(DATA_FILE, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return freshWorld();
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // A corrupt/empty file (e.g. a process killed mid-write, before the
    // atomic-rename fix below existed) shouldn't take the whole server down.
    // Losing the local ledger is a much better failure mode than an
    // unrecoverable crash loop, so log loudly and start over.
    console.error(`[world] ${DATA_FILE} contained invalid JSON, reinitializing a fresh world:`, err.message);
    return freshWorld();
  }

  // Backfill any sites added to the catalog after a world.json already existed.
  for (const site of SITES) {
    if (!parsed.sites[site.id]) parsed.sites[site.id] = { resilience: STARTING_RESILIENCE, health: 100 };
  }
  return parsed;
}

export async function writeWorld(world) {
  await mkdir(DATA_DIR, { recursive: true });
  // Write to a sibling temp file and rename over the real path — rename is
  // atomic on the same volume (POSIX and NTFS), so a concurrent reader (or a
  // process killed mid-write) never observes a truncated/partial file the
  // way a direct writeFile(DATA_FILE, ...) could produce.
  const tmpFile = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmpFile, JSON.stringify(world, null, 2), 'utf-8');
  await rename(tmpFile, DATA_FILE);
}

let lockTail = Promise.resolve();

/**
 * Runs `mutator(world)` with exclusive access to the shared world file:
 * reads it, lets the mutator mutate it in place and return a result, persists
 * the (possibly mutated) world, then resolves with that result. Calls queue
 * behind one another via `lockTail` so two overlapping requests can never
 * interleave their read/write against the same file — without this, two
 * concurrent `await`s could each read the same stale state and race to
 * write, occasionally catching the file mid-write (this is what previously
 * produced "Unexpected end of JSON input" crashes under concurrent polling).
 */
export function transact(mutator) {
  const run = lockTail.then(async () => {
    const world = await readWorld();
    const result = await mutator(world);
    await writeWorld(world);
    return result;
  });
  // Keep the queue moving regardless of this call's outcome; the caller
  // still sees the real result or rejection via `run`.
  lockTail = run.then(
    () => {},
    () => {},
  );
  return run;
}

export const WORLD_CONSTANTS = { BUDGET_CAP, BUDGET_REGEN_PER_HOUR, STARTING_RESILIENCE };
