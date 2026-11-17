import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { createApp } from "../src/app.js";
import { createErrorHandler } from "../src/middleware/errorHandler.js";

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function appThatFails(error: unknown, logged: unknown[]) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(error));
  app.use(createErrorHandler({ logError: (_message, err) => logged.push(err) }));
  return app;
}

test("an unexpected error becomes a 500 JSON body with no stack trace", async () => {
  const logged: unknown[] = [];
  const secret = new Error("DATABASE_URL is required at /home/me/vantage/backend/src/db/client.ts:20");

  await withServer(appThatFails(secret, logged), async (base) => {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 500);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "Something went wrong." });
    assert.doesNotMatch(text, /DATABASE_URL|client\.ts|at /);
  });

  assert.deepEqual(logged, [secret], "the real error is still logged on the server");
});

test("a 4xx error marked safe to show keeps its status and message", async () => {
  const logged: unknown[] = [];
  const notAllowed = Object.assign(new Error("Too many requests, slow down."), { status: 429, expose: true });

  await withServer(appThatFails(notAllowed, logged), async (base) => {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "Too many requests, slow down." });
  });

  assert.equal(logged.length, 0, "client errors aren't logged as server errors");
});

test("a 4xx error not marked safe hides its message", async () => {
  const internal = Object.assign(new Error("user 42 lookup failed in pg"), { statusCode: 400 });

  await withServer(appThatFails(internal, []), async (base) => {
    const res = await fetch(`${base}/boom`);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Bad request" });
  });
});

test("malformed JSON sent to the real app gets a 400 JSON error", async () => {
  await withServer(createApp({ aggregateLocation: async () => { throw new Error("unused"); } }), async (base) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Request body is not valid JSON." });
  });
});

test("the server log never includes the query string (it can hold one-time OAuth codes)", async () => {
  const messages: string[] = [];
  const app = express();
  app.get("/api/auth/google/callback", (_req, _res, next) => next(new Error("token exchange failed")));
  app.use(createErrorHandler({ logError: (message) => messages.push(message) }));
  await withServer(app, async (base) => {
    await fetch(`${base}/api/auth/google/callback?code=SECRET-CODE&state=abc`);
  });
  assert.deepEqual(messages, ["[error] GET /api/auth/google/callback"]);
});
