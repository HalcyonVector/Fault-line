import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Most of the bundle is bundled geodata (country outlines, plate boundaries, cities), not code.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5274,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
