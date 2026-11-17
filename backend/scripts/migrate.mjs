// Applies the SQL files in backend/src/db/migrations/ that haven't been applied yet, in name order.
//
//   npm run db:migrate            apply pending migrations to DATABASE_URL (from the root .env)
//   npm run db:migrate -- --status   only list what is applied and what is pending
//
// Applied files are recorded in a schema_migrations table. Each file runs in its own
// transaction, so a failing migration leaves the database as it was before that file.
//
// First run on a database that was set up by hand (our shared Neon one): files 001 and 003
// can't be run twice, so the script checks what already exists and records those as applied
// instead of running them again.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: join(backendDir, "..", ".env"), quiet: true });

const migrationsDir = join(backendDir, "src", "db", "migrations");
const statusOnly = process.argv.includes("--status");

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to the .env at the repo root.");
  process.exit(1);
}

const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString });

async function exists(sql, params = []) {
  return (await client.query(`SELECT EXISTS (${sql}) AS found`, params)).rows[0].found;
}

/** What a hand-built database already contains, keyed by the migration that creates it. */
async function alreadyPresent() {
  const present = new Set();
  if (await exists("SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'users'")) {
    present.add("001_initial_schema.sql");
  }
  if (await exists("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'google_sub'")) {
    present.add("003_google_oauth.sql");
  }
  return present;
}

try {
  await client.connect();
  const hadTracking = await exists("SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'schema_migrations'");
  const applied = new Set(hadTracking ? (await client.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name) : []);
  const baseline = hadTracking ? new Set() : await alreadyPresent();

  if (statusOnly) {
    for (const name of files) {
      const state = applied.has(name) ? "applied" : baseline.has(name) ? "already in the database (will be recorded, not re-run)" : "pending";
      console.log(`${name}: ${state}`);
    }
  } else {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    let ran = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      if (baseline.has(name)) {
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
        console.log(`recorded  ${name} (already in the database)`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(migrationsDir, name), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`\nFailed on ${name}: ${error.message}\nNothing from that file was kept. Fix it and run again.`);
        process.exitCode = 1;
        break;
      }
      console.log(`applied   ${name}`);
      ran++;
    }
    if (process.exitCode !== 1) console.log(ran === 0 ? "Database is up to date." : `Done: ${ran} migration(s) applied.`);
  }
} catch (error) {
  // Connection errors can include the host; never print the connection string itself.
  console.error(`Could not run migrations: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
