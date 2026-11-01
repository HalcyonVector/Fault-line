import { createApp } from './app.js';

const PORT = process.env.PORT ?? 3002;

createApp().listen(PORT, () => {
  console.log(`[server] fault-line API listening on http://localhost:${PORT}`);
});
