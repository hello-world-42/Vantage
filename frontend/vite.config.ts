import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Env vars (VITE_*) are read from frontend/.env. See .env.example.
  server: {
    proxy: {
      // The frontend only talks to our backend. Port matches PORT in .env.example.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});