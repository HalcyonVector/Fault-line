import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import quakesRouter from './routes/quakes.js';
import archiveRouter from './routes/archive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

// Split from index.js so tests can import the Express app without binding a port.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(compression());

  app.use('/api/quakes', quakesRouter);
  app.use('/api/archive', archiveRouter);
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // In production, serve the built client (npm run build) as static assets.
  // Vite content-hashes everything under /assets, so those can be cached forever;
  // the rest (index.html, sw.js, manifest) must always revalidate.
  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: 0 }));
  app.get('*', (_req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) next();
    });
  });

  return app;
}
