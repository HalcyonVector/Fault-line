import { Router } from 'express';
import { searchArchive } from '../lib/usgsEvent.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json(await searchArchive(req.query));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: 'bad_query', message: err.message });
    console.error('[archive] failed:', err.message);
    res.status(502).json({ error: 'archive_unavailable', message: err.message });
  }
});

export default router;
