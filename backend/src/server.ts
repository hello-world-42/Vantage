import { env } from "./config/env.js";
import { createApp } from "./app.js";

createApp().listen(env.PORT, () => {
  console.log(`Vantage backend listening on http://localhost:${env.PORT}`);
});
