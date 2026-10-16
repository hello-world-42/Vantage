import "dotenv/config";
import { createApp } from "./app.js";

// env validation (config/env.ts) replaces this direct read in the next commit.
const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`Vantage backend listening on http://localhost:${port}`);
});
