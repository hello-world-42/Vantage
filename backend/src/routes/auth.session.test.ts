import assert from "node:assert/strict";
import { after, test } from "node:test";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createAuthRouter } from "./auth.js";
import { createFavoritesRouter } from "./favorites.js";
import type { User } from "../db/schema.js";

const origin = "http://localhost:5173";
const secret = "cookie-session-tests-secret-at-least-32-characters";
const keys = ["JWT_SECRET", "JWT_EXPIRES_IN", "CLIENT_URL", "NODE_ENV"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  JWT_SECRET: secret, JWT_EXPIRES_IN: "1h", CLIENT_URL: origin, NODE_ENV: "test",
});
after(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

const user: User = {
  user_id: 42, username: "Aamir", email: "aamir@example.com",
  password_hash: bcrypt.hashSync("correct-password", 4), google_sub: null,
  role: "user", created_at: new Date("2026-11-15T12:00:00.000Z"),
};
const safeUser = {
  id: 42, username: "Aamir", email: "aamir@example.com", role: "user",
  createdAt: "2026-11-15T12:00:00.000Z",
};
function token(expiresIn = 3600) {
  return jwt.sign({ userId: 42, role: "user" }, secret, { algorithm: "HS256", expiresIn });
}
function app(findUserById = async (_id: number): Promise<User | null> => user) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({ findUserByEmail: async () => user, findUserById }));
  app.use("/api/favorites", createFavoritesRouter({ repository: {
    listForUser: async () => [],
    create: async () => { throw new Error("unused"); },
    deleteForUser: async (_favoriteId, userId) => userId === 42,
  } }));
  return app;
}
function cookies(response: request.Response): string[] {
  return (response.headers["set-cookie"] ?? []) as unknown as string[];
}
function cookiePairs(response: request.Response) {
  return cookies(response).map((cookie) => cookie.split(";")[0]);
}
async function login(agent: ReturnType<typeof request.agent>) {
  const csrf = await agent.get("/api/auth/csrf").expect(200);
  return agent.post("/api/auth/login").set("Origin", origin)
    .set("X-Auth-Mode", "cookie").set("X-CSRF-Token", csrf.body.csrfToken)
    .send({ email: user.email, password: "correct-password" }).expect(200);
}

test("cookie login hides JWT and refresh loads authoritative user without extending expiry", async () => {
  const agent = request.agent(app(async (id) => ({ ...user, user_id: id, username: "Updated" })));
  const loggedIn = await login(agent);
  assert.equal(loggedIn.body.token, undefined);
  assert.deepEqual(loggedIn.body.user, safeUser);
  const sessionCookie = cookies(loggedIn).find((value) => value.startsWith("vantage_session="))!;
  assert.ok(sessionCookie.includes("HttpOnly"));
  assert.ok(sessionCookie.includes("SameSite=Lax"));
  assert.ok(sessionCookie.includes("Path=/"));
  assert.equal(sessionCookie.includes("Domain="), false);
  assert.equal(sessionCookie.includes("Secure"), false);
  const restored = await agent.get("/api/auth/session").expect(200);
  assert.equal(restored.body.user.username, "Updated");
  assert.equal(restored.body.token, undefined);
  assert.equal(typeof restored.body.csrfToken, "string");
  assert.equal(restored.headers["cache-control"], "no-store");
  assert.equal(cookies(restored).some((value) => value.startsWith("vantage_session=")), false);
});

test("legacy login keeps JSON token and does not set an auth cookie", async () => {
  const result = await request(app()).post("/api/auth/login").set("Origin", origin)
    .send({ email: user.email, password: "correct-password" }).expect(200);
  assert.equal(jwt.verify(result.body.token, secret).sub, undefined);
  assert.deepEqual(result.body.user, safeUser);
  assert.equal(cookies(result).some((value) => value.startsWith("vantage_session=")), false);
});

test("login rejects untrusted/missing Origin and cookie mode without CSRF", async () => {
  for (const allowed of [undefined, "https://evil.example"]) {
    let req = request(app()).post("/api/auth/login");
    if (allowed) req = req.set("Origin", allowed);
    await req.send({ email: user.email, password: "correct-password" }).expect(403);
  }
  await request(app()).post("/api/auth/login").set("Origin", origin)
    .set("X-Auth-Mode", "cookie").send({ email: user.email, password: "correct-password" }).expect(403);
});

test("cookie favorites writes require Origin and valid session-bound CSRF; Bearer stays compatible", async () => {
  const server = app();
  const agent = request.agent(server);
  const guest = await agent.get("/api/auth/csrf").expect(200);
  const result = await login(agent);
  await agent.get("/api/favorites").expect(200);
  await agent.delete("/api/favorites/1").set("Origin", origin).expect(403);
  await agent.delete("/api/favorites/1").set("X-CSRF-Token", result.body.csrfToken).expect(403);
  await agent.delete("/api/favorites/1").set("Origin", "https://evil.example")
    .set("X-CSRF-Token", result.body.csrfToken).expect(403);
  await agent.delete("/api/favorites/1").set("Origin", origin)
    .set("X-CSRF-Token", guest.body.csrfToken).expect(403);
  await agent.delete("/api/favorites/1").set("Origin", origin)
    .set("X-CSRF-Token", `${result.body.csrfToken}tampered`).expect(403);
  await agent.delete("/api/favorites/1").set("Origin", origin)
    .set("X-CSRF-Token", result.body.csrfToken).expect(204);
  await request(server).delete("/api/favorites/1").set("Authorization", `Bearer ${token()}`).expect(204);
});

test("CSRF proof from a different session is rejected even with its nonce cookie", async () => {
  const server = app();
  const first = request.agent(server);
  const proof = await login(first);
  const second = jwt.sign({ userId: 42, role: "user", jti: "different-login" }, secret, { expiresIn: "1h" });
  const csrfCookie = cookiePairs(proof).filter((value) => !value.startsWith("vantage_session="));
  await request(server).delete("/api/favorites/1").set("Origin", origin)
    .set("Cookie", [...csrfCookie, `vantage_session=${second}`])
    .set("X-CSRF-Token", proof.body.csrfToken).expect(403);
});

test("invalid cookies cannot fall back to Bearer and session lookup clears invalid/expired cookies", async () => {
  const server = app();
  for (const value of ["invalid", token(-1), ""]) {
    const result = await request(server).get("/api/auth/session")
      .set("Cookie", `vantage_session=${value}`).set("Authorization", `Bearer ${token()}`).expect(401);
    assert.ok(cookies(result).some((cookie) => cookie.startsWith("vantage_session=;") && cookie.includes("1970")));
    await request(server).get("/api/favorites").set("Cookie", `vantage_session=${value}`)
      .set("Authorization", `Bearer ${token()}`).expect(401);
  }
  await request(server).get("/api/auth/session").set("Authorization", `Bearer ${token()}`).expect(401);
});

test("deleted users become guests; transient lookup failures remain retryable", async () => {
  await request(app(async () => null)).get("/api/auth/session")
    .set("Cookie", `vantage_session=${token()}`).expect(401);
  const failed = await request(app(async () => { throw new Error("database unavailable"); }))
    .get("/api/auth/session").set("Cookie", `vantage_session=${token()}`).expect(500);
  assert.equal(cookies(failed).some((value) => value.startsWith("vantage_session=")), false);
});

test("legacy session exchange preserves JWT expiry and ignores cached frontend identity", async () => {
  const agent = request.agent(app());
  const csrf = await agent.get("/api/auth/csrf").expect(200);
  const legacy = token(120);
  const result = await agent.post("/api/auth/session").set("Origin", origin)
    .set("X-CSRF-Token", csrf.body.csrfToken).set("Authorization", `Bearer ${legacy}`)
    .send({ user: { id: 99, role: "admin" } }).expect(200);
  assert.deepEqual(result.body.user, safeUser);
  assert.equal(result.body.token, undefined);
  const cookie = cookies(result).find((value) => value.startsWith("vantage_session="))!;
  assert.equal(decodeURIComponent(cookie.split(";")[0].slice("vantage_session=".length)), legacy);
  const maxAge = Number(cookie.match(/Max-Age=(\d+)/)![1]);
  assert.ok(maxAge > 0 && maxAge <= 120);
  await agent.get("/api/auth/session").expect(200);
});

test("logout clears cookies and expired sessions can use guest CSRF to log out", async () => {
  const server = app();
  const agent = request.agent(server);
  const signedIn = await login(agent);
  await agent.post("/api/auth/logout").set("Origin", origin).expect(403);
  const result = await agent.post("/api/auth/logout").set("Origin", origin)
    .set("X-CSRF-Token", signedIn.body.csrfToken).expect(204);
  assert.ok(cookies(result).some((value) => value.startsWith("vantage_session=;") && value.includes("1970")));
  await agent.get("/api/auth/session").expect(401);
  const guest = await request(server).get("/api/auth/csrf").set("Cookie", `vantage_session=${token(-1)}`).expect(200);
  await request(server).post("/api/auth/logout").set("Origin", origin)
    .set("Cookie", [...cookiePairs(guest), `vantage_session=${token(-1)}`])
    .set("X-CSRF-Token", guest.body.csrfToken).expect(204);
});

test("production cookie login issues Secure session and CSRF cookies", async () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://vantage.example";
  try {
    const server = app();
    const guest = await request(server).get("/api/auth/csrf").expect(200);
    const result = await request(server).post("/api/auth/login").set("Origin", "https://vantage.example")
      .set("Cookie", cookiePairs(guest)).set("X-Auth-Mode", "cookie")
      .set("X-CSRF-Token", guest.body.csrfToken)
      .send({ email: user.email, password: "correct-password" }).expect(200);
    assert.ok(cookies(result).length >= 2);
    assert.ok(cookies(result).every((cookie) => cookie.includes("Secure") && cookie.includes("SameSite=Lax")));
  } finally {
    process.env.NODE_ENV = "test";
    process.env.CLIENT_URL = origin;
  }
});
