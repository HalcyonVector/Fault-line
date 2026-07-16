import { Router } from 'express';
import { fetchQuakes } from '../lib/usgsFeed.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const payload = await fetchQuakes();
    res.json(payload);
  } catch (err) {
    console.error('[quakes] failed:', err.message);
    res.status(502).json({ error: 'quakes_unavailable', message: err.message });
  }
});

export default router;
