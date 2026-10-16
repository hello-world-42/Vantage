import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read the single .env at the repo root (shared with the backend).
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    proxy: {
      // The frontend only ever talks to our backend. Adjust the port to match backend/src/server.ts.
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
