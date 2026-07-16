// Flat-JSON-file-backed persistence for the shared world/ledger state, same
// pattern the old presets store used: read/write a single JSON file, with an
// env var override so tests can isolate their own throwaway copy instead of
// touching the real data file.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // Backfill any sites added to the catalog after a world.json already existed.
    for (const site of SITES) {
      if (!parsed.sites[site.id]) parsed.sites[site.id] = { resilience: STARTING_RESILIENCE, health: 100 };
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return freshWorld();
    throw err;
  }
}

export async function writeWorld(world) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(world, null, 2), 'utf-8');
}

export const WORLD_CONSTANTS = { BUDGET_CAP, BUDGET_REGEN_PER_HOUR, STARTING_RESILIENCE };
