import { Router } from 'express';
import { transact, readWorld } from '../lib/worldStore.js';
import { processWorld, buildWorldView } from '../lib/worldEngine.js';
import { getSite } from '../lib/sites.js';
import { paginateLedger } from '../lib/ledgerPagination.js';

const router = Router();

// GET /api/world runs a processing pass every time it's read (regen budget,
// finalize expired aftershock windows, ingest any not-yet-seen live quakes)
// rather than via a background daemon, simple, and correct in the same
// sense the resilience budget's regen is: it's always recomputed from real
// wall-clock time, whenever someone happens to look. Every read/mutate/write
// against the shared file goes through `transact`, which queues concurrent
// calls so overlapping requests (two tabs, a dev-mode double-poll, etc.)
// never race on the file.
router.get('/', async (_req, res) => {
  try {
    const view = await transact(async (world) => {
      await processWorld(world);
      return buildWorldView(world);
    });
    res.json(view);
  } catch (err) {
    console.error('[world] GET failed:', err.message);
    res.status(500).json({ error: 'world_unavailable', message: err.message });
  }
});

// GET /api/world/ledger pages through the permanent ledger independently of
// the main world snapshot: GET /api/world itself only reports ledgerCount
// (see worldEngine.js's buildWorldView), not the full ledger array, since
// shipping the whole growing history on every regular poll is exactly the
// "unpaginated ledger" limitation this replaces. A read-only report like
// this doesn't need `transact`'s mutation lock: writeWorld's atomic
// temp-file-then-rename means a concurrent reader always sees either the
// fully-old or fully-new file, never a torn one.
router.get('/ledger', async (req, res) => {
  const { siteId, cursor, limit } = req.query;
  if (siteId && !getSite(siteId)) {
    return res.status(400).json({ error: 'invalid_site', message: 'Unknown siteId' });
  }

  try {
    const world = await readWorld();
    const page = paginateLedger(world.ledger, {
      siteId: siteId || null,
      cursor: cursor || null,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    res.json(page);
  } catch (err) {
    console.error('[world] ledger pagination failed:', err.message);
    res.status(500).json({ error: 'world_unavailable', message: err.message });
  }
});

router.post('/allocate', async (req, res) => {
  const { siteId, amount } = req.body ?? {};
  if (typeof siteId !== 'string' || !getSite(siteId)) {
    return res.status(400).json({ error: 'invalid_site', message: 'Unknown siteId' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a positive number' });
  }

  try {
    const result = await transact(async (world) => {
      await processWorld(world);

      if (amount > world.budget.value) {
        return { status: 400, body: { error: 'insufficient_budget', message: 'Not enough resilience budget available' } };
      }

      world.budget.value -= amount;
      const site = world.sites[siteId];
      site.resilience = Math.max(0, Math.min(100, site.resilience + amount));
      return { status: 200, body: buildWorldView(world) };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[world] allocate failed:', err.message);
    res.status(500).json({ error: 'world_unavailable', message: err.message });
  }
});

router.post('/commit-aftershock-response', async (req, res) => {
  const { siteId, amount } = req.body ?? {};
  if (typeof siteId !== 'string' || !getSite(siteId)) {
    return res.status(400).json({ error: 'invalid_site', message: 'Unknown siteId' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a positive number' });
  }

  try {
    const result = await transact(async (world) => {
      await processWorld(world);

      const win = world.activeAftershockWindow;
      if (!win) {
        return { status: 409, body: { error: 'no_active_window', message: 'No aftershock decision window is currently open' } };
      }
      if (Date.now() >= win.expiresAt) {
        return { status: 409, body: { error: 'window_expired', message: 'The decision window has already closed' } };
      }
      if (win.committed) {
        return { status: 409, body: { error: 'already_committed', message: 'A response has already been committed for this window' } };
      }
      if (amount > world.budget.value) {
        return { status: 400, body: { error: 'insufficient_budget', message: 'Not enough resilience budget available' } };
      }

      world.budget.value -= amount;
      const site = world.sites[siteId];
      site.resilience = Math.max(0, Math.min(100, site.resilience + amount));
      win.committed = { siteId, amount, committedAt: Date.now() };
      return { status: 200, body: buildWorldView(world) };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[world] commit-aftershock-response failed:', err.message);
    res.status(500).json({ error: 'world_unavailable', message: err.message });
  }
});

export default router;
