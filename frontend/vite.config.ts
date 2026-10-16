import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward /api calls to the backend so the frontend never needs CORS in dev
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
