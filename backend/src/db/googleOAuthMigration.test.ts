import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { newDb } from "pg-mem";

function createMigratedPool() {
  const database = newDb({ noAstCoverageCheck: true });
  const initialMigration = readFileSync(
    new URL("./migrations/001_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const googleMigrationUrl = new URL(
    "./migrations/003_google_oauth.sql",
    import.meta.url,
  );

  database.public.none(initialMigration);
  if (existsSync(googleMigrationUrl)) {
    database.public.none(readFileSync(googleMigrationUrl, "utf8"));
  }

  const adapter = database.adapters.createPg();
  return new adapter.Pool();
}

test("Google OAuth migration preserves email/password users", async (t) => {
  const pool = createMigratedPool();
  t.after(() => pool.end());

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING password_hash, google_sub`,
    ["Password User", "password@example.com", "bcrypt-hash"],
  );

  assert.equal(result.rows[0].password_hash, "bcrypt-hash");
  assert.equal(result.rows[0].google_sub, null);
});

test("Google OAuth migration permits users with only a Google subject", async (t) => {
  const pool = createMigratedPool();
  t.after(() => pool.end());

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, google_sub)
     VALUES ($1, $2, NULL, $3)
     RETURNING password_hash, google_sub, role`,
    ["Google User", "google@example.com", "google-subject-1"],
  );

  assert.equal(result.rows[0].password_hash, null);
  assert.equal(result.rows[0].google_sub, "google-subject-1");
  assert.equal(result.rows[0].role, "user");
});

test("Google OAuth migration requires at least one authentication method", async (t) => {
  const pool = createMigratedPool();
  t.after(() => pool.end());

  await assert.rejects(
    pool.query(
      `INSERT INTO users (username, email, password_hash, google_sub)
       VALUES ($1, $2, NULL, NULL)`,
      ["No Auth", "no-auth@example.com"],
    ),
  );
});

test("Google OAuth migration enforces unique Google subjects", async (t) => {
  const pool = createMigratedPool();
  t.after(() => pool.end());

  await pool.query(
    `INSERT INTO users (username, email, password_hash, google_sub)
     VALUES ($1, $2, NULL, $3)`,
    ["First Google User", "first-google@example.com", "shared-google-subject"],
  );

  await assert.rejects(
    pool.query(
      `INSERT INTO users (username, email, password_hash, google_sub)
       VALUES ($1, $2, NULL, $3)`,
      ["Second Google User", "second-google@example.com", "shared-google-subject"],
    ),
  );
});
