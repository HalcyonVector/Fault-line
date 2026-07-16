import { Router } from 'express';
import { readWorld, writeWorld } from '../lib/worldStore.js';
import { processWorld, buildWorldView } from '../lib/worldEngine.js';
import { getSite } from '../lib/sites.js';

const router = Router();

// GET /api/world runs a processing pass every time it's read (regen budget,
// finalize expired aftershock windows, ingest any not-yet-seen live quakes)
// rather than via a background daemon — simple, and correct in the same
// sense the resilience budget's regen is: it's always recomputed from real
// wall-clock time, whenever someone happens to look.
router.get('/', async (_req, res) => {
  const world = await readWorld();
  await processWorld(world);
  await writeWorld(world);
  res.json(buildWorldView(world));
});

router.post('/allocate', async (req, res) => {
  const { siteId, amount } = req.body ?? {};
  if (typeof siteId !== 'string' || !getSite(siteId)) {
    return res.status(400).json({ error: 'invalid_site', message: 'Unknown siteId' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a positive number' });
  }

  const world = await readWorld();
  await processWorld(world);

  if (amount > world.budget.value) {
    await writeWorld(world);
    return res.status(400).json({ error: 'insufficient_budget', message: 'Not enough resilience budget available' });
  }

  world.budget.value -= amount;
  const site = world.sites[siteId];
  site.resilience = Math.max(0, Math.min(100, site.resilience + amount));

  await writeWorld(world);
  res.json(buildWorldView(world));
});

router.post('/commit-aftershock-response', async (req, res) => {
  const { siteId, amount } = req.body ?? {};
  if (typeof siteId !== 'string' || !getSite(siteId)) {
    return res.status(400).json({ error: 'invalid_site', message: 'Unknown siteId' });
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amount must be a positive number' });
  }

  const world = await readWorld();
  await processWorld(world);

  const win = world.activeAftershockWindow;
  if (!win) {
    await writeWorld(world);
    return res.status(409).json({ error: 'no_active_window', message: 'No aftershock decision window is currently open' });
  }
  if (Date.now() >= win.expiresAt) {
    await writeWorld(world);
    return res.status(409).json({ error: 'window_expired', message: 'The decision window has already closed' });
  }
  if (win.committed) {
    await writeWorld(world);
    return res.status(409).json({ error: 'already_committed', message: 'A response has already been committed for this window' });
  }
  if (amount > world.budget.value) {
    await writeWorld(world);
    return res.status(400).json({ error: 'insufficient_budget', message: 'Not enough resilience budget available' });
  }

  world.budget.value -= amount;
  const site = world.sites[siteId];
  site.resilience = Math.max(0, Math.min(100, site.resilience + amount));
  win.committed = { siteId, amount, committedAt: Date.now() };

  await writeWorld(world);
  res.json(buildWorldView(world));
});

export default router;
