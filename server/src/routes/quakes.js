import { Router } from 'express';
import { fetchQuakes, DEFAULT_RANGE, RANGES } from '../lib/usgsFeed.js';

const router = Router();

router.get('/', async (req, res) => {
  const range = typeof req.query.range === 'string' ? req.query.range : DEFAULT_RANGE;
  if (!RANGES[range]) {
    return res.status(400).json({ error: 'bad_range', message: `range must be one of ${Object.keys(RANGES).join(', ')}` });
  }
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await fetchQuakes(range));
  } catch (err) {
    console.error('[quakes] failed:', err.message);
    res.status(502).json({ error: 'quakes_unavailable', message: err.message });
  }
});

export default router;
