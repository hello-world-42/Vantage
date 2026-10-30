import assert from "node:assert/strict";
import { after, test } from "node:test";

import express, { type Router } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

import * as favoritesModule from "./favorites.js";

interface FavoriteRecord {
  favorite_id: number;
  user_id: number;
  label: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  saved_at: Date;
}

interface NewFavorite {
  userId: number;
  label: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
}

interface FavoritesRepository {
  create(favorite: NewFavorite): Promise<FavoriteRecord>;
  listForUser(userId: number): Promise<FavoriteRecord[]>;
  deleteForUser(favoriteId: number, userId: number): Promise<boolean>;
}

type CreateFavoritesRouter = (options: {
  repository: FavoritesRepository;
}) => Router;

const createFavoritesRouter = (favoritesModule as unknown as {
  createFavoritesRouter: CreateFavoritesRouter;
}).createFavoritesRouter;

const jwtSecret = "favorites-test-secret-with-at-least-32-characters";
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = jwtSecret;

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

function authorization(userId: number, role: "user" | "admin" = "user") {
  const token = jwt.sign({ userId, role }, jwtSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  return `Bearer ${token}`;
}

function createRepository(initial: FavoriteRecord[] = []) {
  const rows = initial.map((favorite) => ({ ...favorite }));
  let nextId = Math.max(0, ...rows.map((favorite) => favorite.favorite_id)) + 1;
  let createCalls = 0;

  const repository: FavoritesRepository = {
    async create(favorite) {
      createCalls += 1;
      const created: FavoriteRecord = {
        favorite_id: nextId++,
        user_id: favorite.userId,
        label: favorite.label,
        latitude: favorite.latitude,
        longitude: favorite.longitude,
        country: favorite.country,
        city: favorite.city,
        saved_at: new Date("2026-10-29T12:00:00.000Z"),
      };
      rows.push(created);
      return created;
    },
    async listForUser(userId) {
      return rows.filter((favorite) => favorite.user_id === userId);
    },
    async deleteForUser(favoriteId, userId) {
      const index = rows.findIndex(
        (favorite) =>
          favorite.favorite_id === favoriteId && favorite.user_id === userId,
      );
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
  };

  return {
    repository,
    rows,
    getCreateCalls: () => createCalls,
  };
}

function favorite(
  favoriteId: number,
  userId: number,
  overrides: Partial<FavoriteRecord> = {},
): FavoriteRecord {
  return {
    favorite_id: favoriteId,
    user_id: userId,
    label: "Toronto",
    latitude: 43.6532,
    longitude: -79.3832,
    country: "Canada",
    city: "Toronto",
    saved_at: new Date("2026-10-29T12:00:00.000Z"),
    ...overrides,
  };
}

function createTestApp(repository: FavoritesRepository) {
  const app = express();
  app.use(express.json());
  app.use("/api/favorites", createFavoritesRouter({ repository }));
  return app;
}

test("POST /api/favorites saves a normalized location for the authenticated user", async () => {
  const state = createRepository();
  const response = await request(createTestApp(state.repository))
    .post("/api/favorites")
    .set("Authorization", authorization(7))
    .send({
      userId: 999,
      label: "  Downtown Toronto  ",
      latitude: 43.6532,
      longitude: -79.3832,
      city: "  Toronto  ",
    });

  assert.equal(response.status, 201);
  assert.equal(state.rows[0]?.user_id, 7);
  assert.deepEqual(response.body, {
    favorite: {
      id: 1,
      label: "Downtown Toronto",
      latitude: 43.6532,
      longitude: -79.3832,
      country: null,
      city: "Toronto",
      savedAt: "2026-10-29T12:00:00.000Z",
    },
  });
});

test("POST /api/favorites rejects invalid location input before saving", async (t) => {
  const invalidBodies = [
    {
      label: "Location",
      latitude: 91,
      longitude: 0,
    },
    {
      label: "Location",
      latitude: 0,
      longitude: -181,
    },
    {
      label: "",
      latitude: 0,
      longitude: 0,
    },
    {
      label: "Location",
      latitude: "43.6532",
      longitude: -79.3832,
    },
  ];

  for (const body of invalidBodies) {
    await t.test(JSON.stringify(body), async () => {
      const state = createRepository();
      const response = await request(createTestApp(state.repository))
        .post("/api/favorites")
        .set("Authorization", authorization(7))
        .send(body);

      assert.equal(response.status, 400);
      assert.equal(response.body.error, "Invalid favorite data");
      assert.equal(state.getCreateCalls(), 0);
    });
  }
});

test("GET /api/favorites returns only the authenticated user's locations", async () => {
  const state = createRepository([
    favorite(1, 7),
    favorite(2, 8, { label: "Another user's location" }),
  ]);
  const response = await request(createTestApp(state.repository))
    .get("/api/favorites")
    .set("Authorization", authorization(7));

  assert.equal(response.status, 200);
  assert.equal(response.body.favorites.length, 1);
  assert.equal(response.body.favorites[0].id, 1);
  assert.equal(response.body.favorites[0].label, "Toronto");
});

test("DELETE /api/favorites/:favoriteId removes an owned location", async () => {
  const state = createRepository([favorite(1, 7)]);
  const response = await request(createTestApp(state.repository))
    .delete("/api/favorites/1")
    .set("Authorization", authorization(7));

  assert.equal(response.status, 204);
  assert.equal(response.text, "");
  assert.equal(state.rows.length, 0);
});

test("DELETE /api/favorites/:favoriteId hides and preserves another user's location", async () => {
  const state = createRepository([favorite(1, 8)]);
  const response = await request(createTestApp(state.repository))
    .delete("/api/favorites/1")
    .set("Authorization", authorization(7));

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Favorite not found" });
  assert.equal(state.rows.length, 1);
});

test("DELETE /api/favorites/:favoriteId rejects invalid PostgreSQL IDs", async (t) => {
  for (const favoriteId of ["not-a-number", "0", "2147483648"]) {
    await t.test(favoriteId, async () => {
      const state = createRepository();
      const response = await request(createTestApp(state.repository))
        .delete(`/api/favorites/${favoriteId}`)
        .set("Authorization", authorization(7));

      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { error: "Invalid favorite ID" });
    });
  }
});

test("all favorites endpoints require authentication", async () => {
  const app = createTestApp(createRepository().repository);

  const [createResponse, listResponse, deleteResponse] = await Promise.all([
    request(app).post("/api/favorites").send({}),
    request(app).get("/api/favorites"),
    request(app).delete("/api/favorites/1"),
  ]);

  assert.equal(createResponse.status, 401);
  assert.equal(listResponse.status, 401);
  assert.equal(deleteResponse.status, 401);
});
