// The Google callback's browser hand-off: with clientUrl set, every outcome is a redirect to
// the frontend's /auth/callback page with the result in the URL fragment.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import request from "supertest";
import { GoogleAccountConflictError, GoogleAuthenticationError, type GoogleOAuthProvider } from "../src/auth/googleOAuth.js";
import type { User } from "../src/db/schema.js";
import { createAuthRouter } from "../src/routes/auth.js";

const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const saved = { secret: process.env.JWT_SECRET, expires: process.env.JWT_EXPIRES_IN };
process.env.JWT_SECRET = jwtSecret;
process.env.JWT_EXPIRES_IN = "1h";
after(() => {
  if (saved.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.secret;
  if (saved.expires === undefined) delete process.env.JWT_EXPIRES_IN; else process.env.JWT_EXPIRES_IN = saved.expires;
});

const user = {
  user_id: 51, username: "Google Üser", email: "google@example.com", password_hash: null,
  google_sub: "google-subject-1", role: "user", created_at: new Date("2026-10-29T12:00:00.000Z"),
} as User;

function app(overrides: { exchangeCode?: GoogleOAuthProvider["exchangeCode"]; resolveGoogleUser?: () => Promise<User> } = {}) {
  const googleOAuth: GoogleOAuthProvider = {
    createAuthorizationRequest: async () => ({
      authorizationUrl: "https://accounts.google.test/authorize",
      state: "fixed-oauth-state",
      codeVerifier: "fixed-pkce-verifier-with-at-least-43-characters-123",
    }),
    exchangeCode: overrides.exchangeCode ?? (async () => ({ sub: "google-subject-1", email: "google@example.com", name: "Google Üser" })),
  };
  const server = express();
  server.use("/api/auth", createAuthRouter({
    googleOAuth,
    resolveGoogleUser: overrides.resolveGoogleUser ?? (async () => user),
    clientUrl: "http://localhost:5173/", // trailing slash on purpose
  }));
  return server;
}

async function callback(server: express.Express, query: Record<string, string>) {
  const agent = request.agent(server);
  await agent.get("/api/auth/google");
  const response = await agent.get("/api/auth/google/callback").query(query);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.location);
  return { location, fragment: new URLSearchParams(location.hash.slice(1)), body: response.text };
}

test("success: redirects to the frontend with the token and user in the fragment only", async () => {
  const { location, fragment } = await callback(app(), { code: "google-code", state: "fixed-oauth-state" });
  assert.equal(`${location.origin}${location.pathname}`, "http://localhost:5173/auth/callback");
  assert.equal(location.search, "", "nothing in the query string, which servers log");

  const payload = jwt.verify(fragment.get("token")!, jwtSecret) as JwtPayload;
  assert.equal(payload.userId, 51);
  // Same decoding the frontend does (base64url -> UTF-8 JSON), including non-ASCII names.
  const decoded = JSON.parse(Buffer.from(fragment.get("user")!, "base64url").toString("utf8"));
  assert.deepEqual(decoded, { id: 51, username: "Google Üser", email: "google@example.com", role: "user", createdAt: "2026-10-29T12:00:00.000Z" });
});

test("failures redirect with the error codes the frontend page understands", async () => {
  const wrongState = await callback(app(), { code: "c", state: "wrong" });
  assert.equal(wrongState.fragment.get("error"), "state");

  const cancelled = await callback(app(), { error: "access_denied", state: "fixed-oauth-state" });
  assert.equal(cancelled.fragment.get("error"), "failed");

  const rejected = await callback(app({ exchangeCode: async () => { throw new GoogleAuthenticationError(); } }), { code: "c", state: "fixed-oauth-state" });
  assert.equal(rejected.fragment.get("error"), "failed");

  const conflict = await callback(app({ resolveGoogleUser: async () => { throw new GoogleAccountConflictError(); } }), { code: "c", state: "fixed-oauth-state" });
  assert.equal(conflict.fragment.get("error"), "conflict");
  for (const result of [wrongState, cancelled, rejected, conflict]) assert.equal(result.fragment.get("token"), null);
});

test("an unexpected error (database down) still lands on the app's error page, without details", async () => {
  const original = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const result = await callback(app({ resolveGoogleUser: async () => { throw new Error("connect ECONNREFUSED db.internal:5432"); } }), { code: "c", state: "fixed-oauth-state" });
    assert.equal(result.fragment.get("error"), "failed");
    assert.doesNotMatch(result.location.href + result.body, /ECONNREFUSED|db\.internal/);
    assert.equal(logged.length, 1, "the real error is logged on the server");
  } finally {
    console.error = original;
  }
});
