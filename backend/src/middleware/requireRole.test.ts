import assert from "node:assert/strict";
import { after, test } from "node:test";

import express, { type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

import { authenticate, type AuthenticatedUser } from "./authenticate.js";
import * as requireRoleModule from "./requireRole.js";

type RequireRole = (role: AuthenticatedUser["role"]) => RequestHandler;

const requireRole = (requireRoleModule as unknown as {
  requireRole: RequireRole;
}).requireRole;
const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const originalJwtSecret = process.env.JWT_SECRET;

process.env.JWT_SECRET = jwtSecret;

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

function tokenFor(role: AuthenticatedUser["role"]): string {
  return jwt.sign({ userId: 42, role }, jwtSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

function createTestApp() {
  const app = express();
  app.get("/user", authenticate, requireRole("user"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/admin", authenticate, requireRole("admin"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/role-only", requireRole("user"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

test("requireRole allows a user to access user routes", async () => {
  const response = await request(createTestApp())
    .get("/user")
    .set("Authorization", `Bearer ${tokenFor("user")}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test("requireRole allows an admin to access user and admin routes", async () => {
  const app = createTestApp();
  const authorization = `Bearer ${tokenFor("admin")}`;

  const userResponse = await request(app)
    .get("/user")
    .set("Authorization", authorization);
  const adminResponse = await request(app)
    .get("/admin")
    .set("Authorization", authorization);

  assert.equal(userResponse.status, 200);
  assert.equal(adminResponse.status, 200);
});

test("requireRole returns 401 when authentication is missing", async () => {
  const response = await request(createTestApp()).get("/role-only");

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Unauthorized" });
});

test("requireRole returns 403 when a user requests an admin route", async () => {
  const response = await request(createTestApp())
    .get("/admin")
    .set("Authorization", `Bearer ${tokenFor("user")}`);

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: "Forbidden" });
});
