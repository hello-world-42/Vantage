import assert from "node:assert/strict";
import { after, test } from "node:test";

import bcrypt from "bcrypt";
import express, { type Router } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import request from "supertest";

import { createAuthRouter } from "./auth.js";

interface LoginUserRow {
  user_id: number;
  username: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  role: "user" | "admin";
  created_at: Date;
}

type FindUserByEmail = (email: string) => Promise<LoginUserRow | null>;
type CreateLoginAuthRouter = (options: { findUserByEmail: FindUserByEmail }) => Router;

const createLoginAuthRouter = createAuthRouter as unknown as CreateLoginAuthRouter;
const jwtSecret = "test-only-jwt-secret-with-at-least-32-characters";
const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtExpiresIn = process.env.JWT_EXPIRES_IN;

process.env.JWT_SECRET = jwtSecret;
process.env.JWT_EXPIRES_IN = "1h";

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;

  if (originalJwtExpiresIn === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = originalJwtExpiresIn;
});

function createTestApp(findUserByEmail: FindUserByEmail) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createLoginAuthRouter({ findUserByEmail }));
  return app;
}

async function createUser(password = "correct-password"): Promise<LoginUserRow> {
  return {
    user_id: 42,
    username: "Aamir",
    email: "aamir@example.com",
    password_hash: await bcrypt.hash(password, 4),
    google_sub: null,
    role: "user",
    created_at: new Date("2026-10-29T12:00:00.000Z"),
  };
}

test("POST /api/auth/login returns a token and sanitized user for valid credentials", async () => {
  const user = await createUser();
  let queriedEmail: string | undefined;
  const app = createTestApp(async (email) => {
    queriedEmail = email;
    return user;
  });

  const response = await request(app).post("/api/auth/login").send({
    email: "  AAMIR@Example.com  ",
    password: "correct-password",
  });

  assert.equal(response.status, 200);
  assert.equal(queriedEmail, "aamir@example.com");
  assert.equal(typeof response.body.token, "string");
  assert.deepEqual(response.body.user, {
    id: 42,
    username: "Aamir",
    email: "aamir@example.com",
    role: "user",
    createdAt: "2026-10-29T12:00:00.000Z",
  });
  assert.equal("password" in response.body.user, false);
  assert.equal("password_hash" in response.body.user, false);
});

test("POST /api/auth/login signs JWT claims with the configured expiration", async () => {
  const app = createTestApp(async () => createUser());

  const response = await request(app).post("/api/auth/login").send({
    email: "aamir@example.com",
    password: "correct-password",
  });

  assert.equal(response.status, 200);
  const payload = jwt.verify(response.body.token, jwtSecret) as JwtPayload;
  assert.equal(payload.userId, 42);
  assert.equal(payload.role, "user");
  assert.equal(payload.exp! - payload.iat!, 60 * 60);
});

test("POST /api/auth/login returns generic 401 for an incorrect password", async () => {
  const app = createTestApp(async () => createUser());

  const response = await request(app).post("/api/auth/login").send({
    email: "aamir@example.com",
    password: "wrong-password",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid email or password" });
});

test("POST /api/auth/login returns generic 401 for a nonexistent account", async () => {
  const app = createTestApp(async () => null);

  const response = await request(app).post("/api/auth/login").send({
    email: "missing@example.com",
    password: "some-password",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid email or password" });
});

test("POST /api/auth/login returns generic 401 for a Google-only account", async () => {
  const app = createTestApp(async () => ({
    user_id: 43,
    username: "Google User",
    email: "google@example.com",
    password_hash: null,
    google_sub: "google-subject-1",
    role: "user",
    created_at: new Date("2026-10-29T12:00:00.000Z"),
  }));

  const response = await request(app).post("/api/auth/login").send({
    email: "google@example.com",
    password: "some-password",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid email or password" });
});

test("POST /api/auth/login rejects invalid input before querying the database", async () => {
  let queryCount = 0;
  const app = createTestApp(async () => {
    queryCount += 1;
    return null;
  });

  const response = await request(app).post("/api/auth/login").send({
    email: "not-an-email",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid login data");
  assert.equal(queryCount, 0);
});
