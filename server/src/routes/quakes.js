import { Router } from 'express';
import { fetchQuakes, DEFAULT_RANGE, RANGES } from '../lib/usgsFeed.js';
import { fetchObserved } from '../lib/usgsEvent.js';

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

// USGS event ids are short alphanumerics such as us6000pi9w or ci38457511.
router.get('/:id/observed', async (req, res) => {
  if (!/^[a-z0-9_-]{4,40}$/i.test(req.params.id)) return res.status(400).json({ error: 'bad_id', message: 'Not a USGS event id' });
  try {
    res.json(await fetchObserved(req.params.id));
  } catch (err) {
    console.error('[observed] failed:', err.message);
    res.status(502).json({ error: 'observed_unavailable', message: err.message });
  }
});

export default router;
