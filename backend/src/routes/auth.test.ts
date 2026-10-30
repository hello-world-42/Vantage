import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcrypt";
import express, { type Router } from "express";
import request from "supertest";

import * as authModule from "./auth.js";

interface RegisteredUserRow {
  user_id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  created_at: Date;
}

interface NewUserRecord {
  username: string;
  email: string;
  passwordHash: string;
  role: "user";
}

type InsertUser = (user: NewUserRecord) => Promise<RegisteredUserRow>;
type CreateAuthRouter = (options: { insertUser: InsertUser }) => Router;

const createAuthRouter = (authModule as unknown as {
  createAuthRouter: CreateAuthRouter;
}).createAuthRouter;

function createTestApp(insertUser: InsertUser) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({ insertUser }));
  return app;
}

test("POST /api/auth/register creates a user with a bcrypt password hash", async () => {
  let insertedUser: NewUserRecord | undefined;
  const app = createTestApp(async (user) => {
    insertedUser = user;
    return {
      user_id: 7,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: new Date("2026-10-29T12:00:00.000Z"),
    };
  });

  const response = await request(app).post("/api/auth/register").send({
    username: "  Aamir  ",
    email: "  AAMIR@Example.com  ",
    password: "correct horse battery staple",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    user: {
      id: 7,
      username: "Aamir",
      email: "aamir@example.com",
      role: "user",
      createdAt: "2026-10-29T12:00:00.000Z",
    },
  });
  assert.ok(insertedUser);
  assert.notEqual(insertedUser.passwordHash, "correct horse battery staple");
  assert.equal(bcrypt.getRounds(insertedUser.passwordHash), 12);
  assert.equal(
    await bcrypt.compare("correct horse battery staple", insertedUser.passwordHash),
    true,
  );
  assert.equal("password" in response.body.user, false);
  assert.equal("passwordHash" in response.body.user, false);
  assert.equal("password_hash" in response.body.user, false);
  assert.equal("token" in response.body, false);
});

test("POST /api/auth/register rejects missing or invalid required inputs", async (t) => {
  let insertCount = 0;
  const app = createTestApp(async () => {
    insertCount += 1;
    throw new Error("insert should not run");
  });

  const invalidBodies = [
    { email: "user@example.com", password: "password123" },
    { username: "User", email: "not-an-email", password: "password123" },
    { username: "User", email: "user@example.com", password: "short" },
  ];

  for (const body of invalidBodies) {
    await t.test(JSON.stringify(body), async () => {
      const response = await request(app).post("/api/auth/register").send(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "Invalid registration data");
    });
  }

  assert.equal(insertCount, 0);
});

test("POST /api/auth/register returns 409 for a duplicate email", async () => {
  const app = createTestApp(async () => {
    throw Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "users_email_key",
    });
  });

  const response = await request(app).post("/api/auth/register").send({
    username: "Existing User",
    email: "existing@example.com",
    password: "password123",
  });

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: "An account with this email already exists",
  });
});

test("POST /api/auth/register ignores an attempted admin role", async () => {
  let insertedRole: NewUserRecord["role"] | undefined;
  const app = createTestApp(async (user) => {
    insertedRole = user.role;
    return {
      user_id: 8,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: new Date("2026-10-29T12:00:00.000Z"),
    };
  });

  const response = await request(app).post("/api/auth/register").send({
    username: "Not Admin",
    email: "not-admin@example.com",
    password: "password123",
    role: "admin",
  });

  assert.equal(response.status, 201);
  assert.equal(insertedRole, "user");
  assert.equal(response.body.user.role, "user");
});
