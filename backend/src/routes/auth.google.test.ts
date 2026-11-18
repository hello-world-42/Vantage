import assert from "node:assert/strict";
import { after, test } from "node:test";

import express, { type Router } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import request from "supertest";

import type { User } from "../db/schema.js";
import * as googleOAuthModule from "../auth/googleOAuth.js";
import { createAuthRouter } from "./auth.js";

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

interface GoogleOAuthProvider {
  createAuthorizationRequest(): Promise<{
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  }>;
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleIdentity>;
}

type ResolveGoogleUser = (identity: GoogleIdentity) => Promise<User>;
type CreateGoogleAuthRouter = (options: {
  googleOAuth: GoogleOAuthProvider;
  resolveGoogleUser: ResolveGoogleUser;
  findUserById: (userId: number) => Promise<User | null>;
}) => Router;

const createGoogleAuthRouter = createAuthRouter as unknown as CreateGoogleAuthRouter;
const GoogleAccountConflictError = (googleOAuthModule as unknown as {
  GoogleAccountConflictError: new () => Error;
}).GoogleAccountConflictError;
const GoogleAuthenticationError = (googleOAuthModule as unknown as {
  GoogleAuthenticationError: new () => Error;
}).GoogleAuthenticationError;
const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtExpiresIn = process.env.JWT_EXPIRES_IN;
const originalClientUrl = process.env.CLIENT_URL;
const originalNodeEnv = process.env.NODE_ENV;

process.env.JWT_SECRET = jwtSecret;
process.env.JWT_EXPIRES_IN = "1h";
process.env.CLIENT_URL = "http://localhost:5173/globe";
process.env.NODE_ENV = "test";

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;

  if (originalJwtExpiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = originalJwtExpiresIn;
  if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = originalClientUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function googleUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 51,
    username: "Google User",
    email: "google@example.com",
    password_hash: null,
    google_sub: "google-subject-1",
    role: "user",
    created_at: new Date("2026-10-29T12:00:00.000Z"),
    ...overrides,
  };
}

function createTestApp(options: {
  exchangeCode?: GoogleOAuthProvider["exchangeCode"];
  resolveGoogleUser?: ResolveGoogleUser;
}) {
  const googleOAuth: GoogleOAuthProvider = {
    createAuthorizationRequest: async () => ({
      authorizationUrl: "https://accounts.google.test/authorize",
      state: "fixed-oauth-state",
      codeVerifier: "fixed-pkce-verifier-with-at-least-43-characters-123",
    }),
    exchangeCode:
      options.exchangeCode ??
      (async () => ({
        sub: "google-subject-1",
        email: "google@example.com",
        name: "Google User",
      })),
  };
  const app = express();
  app.use(
    "/api/auth",
    createGoogleAuthRouter({
      googleOAuth,
      resolveGoogleUser: options.resolveGoogleUser ?? (async () => googleUser()),
      findUserById: async (userId) => userId === 51 ? googleUser() : null,
    }),
  );
  return app;
}

test("GET /api/auth/google redirects with signed HttpOnly OAuth cookies", async () => {
  const response = await request(createTestApp({})).get("/api/auth/google");

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, "https://accounts.google.test/authorize");
  const cookies = response.headers["set-cookie"] as unknown as string[];
  assert.equal(cookies.length, 2);
  assert.ok(cookies.some((cookie) => cookie.startsWith("vantage_google_state=")));
  assert.ok(cookies.some((cookie) => cookie.startsWith("vantage_google_verifier=")));
  assert.ok(cookies.every((cookie) => cookie.includes("=s%3A")));
  assert.ok(cookies.every((cookie) => cookie.includes("HttpOnly")));
  assert.ok(cookies.every((cookie) => cookie.includes("SameSite=Lax")));
  assert.equal(response.headers.location.includes("token="), false);
});

test("Google callback preserves state/PKCE and redirects with an HttpOnly JWT, never a URL/JSON token", async () => {
  let exchangedCode: string | undefined;
  let exchangedVerifier: string | undefined;
  let resolvedIdentity: GoogleIdentity | undefined;
  const app = createTestApp({
    exchangeCode: async (code, verifier) => {
      exchangedCode = code;
      exchangedVerifier = verifier;
      return {
        sub: "google-subject-1",
        email: "google@example.com",
        name: "Google User",
      };
    },
    resolveGoogleUser: async (identity) => {
      resolvedIdentity = identity;
      return googleUser();
    },
  });
  const agent = request.agent(app);

  await agent.get("/api/auth/google");
  const response = await agent
    .get("/api/auth/google/callback")
    .query({ code: "google-authorization-code", state: "fixed-oauth-state", next: "https://evil.example" });

  assert.equal(response.status, 303);
  assert.equal(exchangedCode, "google-authorization-code");
  assert.equal(
    exchangedVerifier,
    "fixed-pkce-verifier-with-at-least-43-characters-123",
  );
  assert.deepEqual(resolvedIdentity, {
    sub: "google-subject-1",
    email: "google@example.com",
    name: "Google User",
  });
  const cookies = response.headers["set-cookie"] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith("vantage_session="));
  assert.ok(cookie);
  assert.ok(cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax") && cookie.includes("Path=/"));
  assert.equal(cookie.includes("Domain="), false);
  assert.equal(cookie.includes("Secure"), false);
  const token = decodeURIComponent(cookie.split(";")[0].slice("vantage_session=".length));
  const payload = jwt.verify(token, jwtSecret) as JwtPayload;
  assert.equal(payload.userId, 51);
  assert.equal(payload.role, "user");
  assert.equal(response.headers.location, "http://localhost:5173/globe");
  assert.equal(response.headers.location.includes(token), false);
  assert.equal(response.body.token, undefined);
  assert.equal(response.text.includes(token), false);
  assert.equal(response.headers["cache-control"], "no-store");
  const restored = await agent.get("/api/auth/session");
  assert.equal(restored.status, 200);
  assert.equal(restored.body.user.id, 51);
  assert.equal(typeof restored.body.csrfToken, "string");
});

test("production OAuth success sets Secure cookies and redirects only to configured HTTPS frontend", async () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://vantage.example/globe";
  try {
    const app = createTestApp({});
    const started = await request(app).get("/api/auth/google");
    const cookies = started.headers["set-cookie"] as unknown as string[];
    const response = await request(app).get("/api/auth/google/callback")
      .set("Cookie", cookies.map((cookie) => cookie.split(";")[0]))
      .query({ code: "code", state: "fixed-oauth-state" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, "https://vantage.example/globe");
    const issued = response.headers["set-cookie"] as unknown as string[];
    assert.ok(issued.some((cookie) => cookie.startsWith("vantage_session=") && cookie.includes("Secure") && cookie.includes("HttpOnly")));
  } finally {
    process.env.NODE_ENV = "test";
    process.env.CLIENT_URL = "http://localhost:5173/globe";
  }
});

test("Google callback rejects missing or mismatched OAuth state before code exchange", async () => {
  let exchangeCount = 0;
  const app = createTestApp({
    exchangeCode: async () => {
      exchangeCount += 1;
      return { sub: "sub", email: "user@example.com", name: "User" };
    },
  });
  const agent = request.agent(app);

  await agent.get("/api/auth/google");
  const response = await agent
    .get("/api/auth/google/callback")
    .query({ code: "code", state: "wrong-state" });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid OAuth state" });
  assert.equal(exchangeCount, 0);
});

test("Google callback returns 401 when Google identity verification fails", async () => {
  const app = createTestApp({
    exchangeCode: async () => {
      throw new GoogleAuthenticationError();
    },
  });
  const agent = request.agent(app);

  await agent.get("/api/auth/google");
  const response = await agent
    .get("/api/auth/google/callback")
    .query({ code: "code", state: "fixed-oauth-state" });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Google authentication failed" });
});

test("Google callback returns 409 instead of linking an existing email account", async () => {
  const app = createTestApp({
    resolveGoogleUser: async () => {
      throw new GoogleAccountConflictError();
    },
  });
  const agent = request.agent(app);

  await agent.get("/api/auth/google");
  const response = await agent
    .get("/api/auth/google/callback")
    .query({ code: "code", state: "fixed-oauth-state" });

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: "An account with this email already exists",
  });
});
