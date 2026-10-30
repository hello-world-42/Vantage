import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApp } from "./app.js";

// The team uses one .env at the repo root, shared with the frontend (see .env.example).
// This path works from both src/ (dev) and dist/ (build).
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

// env validation (config/env.ts) replaces this direct read in a later commit.
const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`Vantage backend listening on http://localhost:${port}`);
});
