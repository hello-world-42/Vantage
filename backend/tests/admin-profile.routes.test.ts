import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import type { DataSource, User } from "../src/db/schema.js";
import { createErrorHandler } from "../src/middleware/errorHandler.js";
import { createAdminRouter, type AdminRepository } from "../src/routes/admin.js";
import { createProfileRouter, EmailTakenError, type ProfileChanges, type ProfileRepository } from "../src/routes/profile.js";

const secret = "test-only-jwt-secret-with-at-least-32-characters";
const savedSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = secret;
after(() => { if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret; });

const tokenFor = (userId: number, role: "user" | "admin") => jwt.sign({ userId, role }, secret, { algorithm: "HS256", expiresIn: "1h" });

async function withApp(mount: (app: express.Express) => void, fn: (call: (method: string, path: string, token?: string, body?: unknown) => Promise<{ status: number; body: any }>) => Promise<void>) {
  const app = express();
  app.use(express.json());
  mount(app);
  app.use(createErrorHandler({ logError: () => {} }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn(async (method, path, token, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    });
  } finally {
    server.close();
  }
}

/* ───────────── Admin ───────────── */

function adminRepo() {
  const sources: DataSource[] = [
    { source_id: 1, updated_by: null, name: "Open-Meteo", category: "weather", is_enabled: true, last_status: null, last_checked_at: null },
    { source_id: 2, updated_by: null, name: "USGS", category: "hazards", is_enabled: true, last_status: null, last_checked_at: null },
  ];
  const row = (id: number, role: "user" | "admin") => ({ user_id: id, username: `u${id}`, email: `u${id}@example.com`, role, created_at: new Date("2026-11-01T00:00:00Z"), has_password: true, has_google: false });
  const users = [row(1, "admin"), row(2, "user")];
  const repository: AdminRepository = {
    listDataSources: async () => sources,
    setDataSourceEnabled: async (id, isEnabled, by) => {
      const s = sources.find((x) => x.source_id === id);
      if (!s) return null;
      s.is_enabled = isEnabled; s.updated_by = by;
      return s;
    },
    listUsers: async () => users,
    setUserRole: async (id, role) => { const u = users.find((x) => x.user_id === id); if (!u) return null; u.role = role; return u; },
    deleteUser: async (id) => { const i = users.findIndex((x) => x.user_id === id); if (i < 0) return false; users.splice(i, 1); return true; },
  };
  return { repository, sources, users };
}

test("admin routes: guests get 401 and regular users get 403", async () => {
  await withApp((app) => app.use("/api/admin", createAdminRouter({ repository: adminRepo().repository })), async (call) => {
    assert.equal((await call("GET", "/api/admin/users")).status, 401);
    assert.equal((await call("GET", "/api/admin/users", tokenFor(2, "user"))).status, 403);
    assert.equal((await call("PATCH", "/api/admin/data-sources/1", tokenFor(2, "user"), { isEnabled: false })).status, 403);
  });
});

test("admin can list and switch data sources; the aggregator is told right away", async () => {
  const { repository, sources } = adminRepo();
  let notified = 0;
  await withApp((app) => app.use("/api/admin", createAdminRouter({ repository, onDataSourcesChanged: () => notified++ })), async (call) => {
    const admin = tokenFor(1, "admin");
    const list = await call("GET", "/api/admin/data-sources", admin);
    assert.deepEqual(list.body.dataSources.map((s: any) => [s.name, s.isEnabled]), [["Open-Meteo", true], ["USGS", true]]);

    const off = await call("PATCH", "/api/admin/data-sources/2", admin, { isEnabled: false });
    assert.equal(off.status, 200);
    assert.deepEqual([off.body.dataSource.isEnabled, off.body.dataSource.updatedBy], [false, 1]);
    assert.equal(sources[1].is_enabled, false);
    assert.equal(notified, 1);

    assert.equal((await call("PATCH", "/api/admin/data-sources/99", admin, { isEnabled: false })).status, 404);
    assert.equal((await call("PATCH", "/api/admin/data-sources/2", admin, { isEnabled: "no" })).status, 400);
    assert.equal((await call("PATCH", "/api/admin/data-sources/abc", admin, { isEnabled: true })).status, 400);
  });
});

test("admin can manage users but can't demote or delete themselves", async () => {
  const { repository, users } = adminRepo();
  await withApp((app) => app.use("/api/admin", createAdminRouter({ repository })), async (call) => {
    const admin = tokenFor(1, "admin");
    const list = await call("GET", "/api/admin/users", admin);
    assert.deepEqual(Object.keys(list.body.users[0]).sort(), ["createdAt", "email", "id", "role", "signIn", "username"], "no password hash in the response");

    assert.equal((await call("PATCH", "/api/admin/users/2", admin, { role: "admin" })).body.user.role, "admin");
    assert.equal((await call("PATCH", "/api/admin/users/1", admin, { role: "user" })).status, 400);
    assert.equal((await call("DELETE", "/api/admin/users/1", admin)).status, 400);
    assert.equal((await call("DELETE", "/api/admin/users/2", admin)).status, 204);
    assert.equal((await call("DELETE", "/api/admin/users/2", admin)).status, 404);
    assert.deepEqual(users.map((u) => u.user_id), [1]);
  });
});

/* ───────────── Profile ───────────── */

async function profileRepo() {
  const user: User = {
    user_id: 7, username: "Demo", email: "demo@example.com", password_hash: await bcrypt.hash("old password!", 4),
    google_sub: null, role: "user", created_at: new Date("2026-11-01T00:00:00Z"),
  };
  const applied: ProfileChanges[] = [];
  const repository: ProfileRepository = {
    findById: async (id) => (id === user.user_id ? user : null),
    update: async (_id, changes) => {
      if (changes.email === "taken@example.com") throw new EmailTakenError();
      applied.push(changes);
      if (changes.username) user.username = changes.username;
      if (changes.email) user.email = changes.email;
      if (changes.passwordHash) user.password_hash = changes.passwordHash;
      return user;
    },
  };
  return { repository, user, applied };
}

test("profile: read your own account; no password hash in the response", async () => {
  const { repository } = await profileRepo();
  await withApp((app) => app.use("/api/profile", createProfileRouter({ repository })), async (call) => {
    assert.equal((await call("GET", "/api/profile")).status, 401);
    const me = await call("GET", "/api/profile", tokenFor(7, "user"));
    assert.deepEqual(me.body.user, { id: 7, username: "Demo", email: "demo@example.com", role: "user", createdAt: "2026-11-01T00:00:00.000Z", signIn: { password: true, google: false } });
    assert.equal((await call("GET", "/api/profile", tokenFor(999, "user"))).status, 401, "a deleted account is logged out");
  });
});

test("profile: username changes freely; email and password need the current password", async () => {
  const { repository, user, applied } = await profileRepo();
  await withApp((app) => app.use("/api/profile", createProfileRouter({ repository })), async (call) => {
    const token = tokenFor(7, "user");
    assert.equal((await call("PUT", "/api/profile", token, { username: "  New Name " })).body.user.username, "New Name");

    assert.equal((await call("PUT", "/api/profile", token, { email: "new@example.com" })).status, 400);
    assert.equal((await call("PUT", "/api/profile", token, { email: "new@example.com", currentPassword: "wrong" })).status, 403);
    assert.equal(user.email, "demo@example.com");

    const changed = await call("PUT", "/api/profile", token, { email: "NEW@Example.com", newPassword: "brand new password", currentPassword: "old password!" });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.email, "new@example.com");
    assert.ok(await bcrypt.compare("brand new password", user.password_hash!), "stored as a bcrypt hash");
    assert.ok(!JSON.stringify(applied).includes("brand new password"), "the plain password never reaches the database layer");

    assert.equal((await call("PUT", "/api/profile", token, { newPassword: "short", currentPassword: "brand new password" })).status, 400);
    assert.equal((await call("PUT", "/api/profile", token, { email: "taken@example.com", currentPassword: "brand new password" })).status, 409);
    assert.equal((await call("PUT", "/api/profile", token, { role: "admin" })).status, 400, "unknown fields like role are rejected");
  });
});

test("profile: a Google-only account can rename itself but not set an email or password", async () => {
  const { repository, user } = await profileRepo();
  user.password_hash = null; user.google_sub = "g-1";
  await withApp((app) => app.use("/api/profile", createProfileRouter({ repository })), async (call) => {
    const token = tokenFor(7, "user");
    assert.equal((await call("PUT", "/api/profile", token, { username: "G" })).status, 200);
    const refused = await call("PUT", "/api/profile", token, { newPassword: "a new password 123" });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /Google/);
  });
});
