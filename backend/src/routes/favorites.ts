import { Router } from "express";
import { z } from "zod";

import { query } from "../db/client.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

export interface FavoriteRecord {
  favorite_id: number;
  user_id: number;
  label: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  saved_at: Date;
}

export interface NewFavorite {
  userId: number;
  label: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
}

export interface FavoritesRepository {
  create(favorite: NewFavorite): Promise<FavoriteRecord>;
  listForUser(userId: number): Promise<FavoriteRecord[]>;
  deleteForUser(favoriteId: number, userId: number): Promise<boolean>;
}

interface FavoritesRouterOptions {
  repository?: FavoritesRepository;
}

const optionalLocationText = z
  .union([z.string().trim().min(1).max(100), z.null()])
  .optional()
  .transform((value) => value ?? null);

const createFavoriteSchema = z.object({
  label: z.string().trim().min(1).max(255),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  country: optionalLocationText,
  city: optionalLocationText,
});

const favoriteIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= 2_147_483_647);

const FAVORITE_COLUMNS = `favorite_id, user_id, label,
  latitude::double precision AS latitude,
  longitude::double precision AS longitude,
  country, city, saved_at`;

const databaseFavoritesRepository: FavoritesRepository = {
  async create(favorite) {
    const result = await query<FavoriteRecord>(
      `INSERT INTO favorite_locations
         (user_id, label, latitude, longitude, country, city)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FAVORITE_COLUMNS}`,
      [
        favorite.userId,
        favorite.label,
        favorite.latitude,
        favorite.longitude,
        favorite.country,
        favorite.city,
      ],
    );

    const createdFavorite = result.rows[0];
    if (!createdFavorite) {
      throw new Error("Favorite creation did not return the saved location");
    }
    return createdFavorite;
  },

  async listForUser(userId) {
    const result = await query<FavoriteRecord>(
      `SELECT ${FAVORITE_COLUMNS}
       FROM favorite_locations
       WHERE user_id = $1
       ORDER BY saved_at DESC, favorite_id DESC`,
      [userId],
    );
    return result.rows;
  },

  async deleteForUser(favoriteId, userId) {
    const result = await query<{ favorite_id: number }>(
      `DELETE FROM favorite_locations
       WHERE favorite_id = $1 AND user_id = $2
       RETURNING favorite_id`,
      [favoriteId, userId],
    );
    return result.rows.length > 0;
  },
};

function serializeFavorite(favorite: FavoriteRecord) {
  return {
    id: favorite.favorite_id,
    label: favorite.label,
    latitude: favorite.latitude,
    longitude: favorite.longitude,
    country: favorite.country,
    city: favorite.city,
    savedAt: favorite.saved_at.toISOString(),
  };
}

export function createFavoritesRouter(
  options: FavoritesRouterOptions = {},
): Router {
  const router = Router();
  const repository = options.repository ?? databaseFavoritesRepository;

  router.use(authenticate, requireRole("user"));

  router.post("/", async (req, res, next) => {
    const parsedInput = createFavoriteSchema.safeParse(req.body);
    if (!parsedInput.success) {
      res.status(400).json({
        error: "Invalid favorite data",
        details: parsedInput.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const savedFavorite = await repository.create({
        userId: req.user!.userId,
        ...parsedInput.data,
      });
      res.status(201).json({ favorite: serializeFavorite(savedFavorite) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const favorites = await repository.listForUser(req.user!.userId);
      res.json({ favorites: favorites.map(serializeFavorite) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:favoriteId", async (req, res, next) => {
    const parsedId = favoriteIdSchema.safeParse(req.params.favoriteId);
    if (!parsedId.success) {
      res.status(400).json({ error: "Invalid favorite ID" });
      return;
    }

    try {
      const deleted = await repository.deleteForUser(
        parsedId.data,
        req.user!.userId,
      );
      if (!deleted) {
        res.status(404).json({ error: "Favorite not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const favoritesRouter = createFavoritesRouter();
