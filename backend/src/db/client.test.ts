import assert from "node:assert/strict";
import test from "node:test";

import * as databaseClient from "./client.js";

test("database pool requires DATABASE_URL", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.throws(
      () => databaseClient.getDatabasePool(),
      /DATABASE_URL is required/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
