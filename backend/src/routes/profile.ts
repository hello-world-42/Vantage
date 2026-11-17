// The signed-in user's own account.
//
//   GET /api/profile   -> { user }
//   PUT /api/profile   { username?, email?, currentPassword?, newPassword? } -> { user }
//
// Changing the email or the password needs the current password. Accounts that sign in with
// Google only (no password) can change their username; their email belongs to Google.
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client.js";
import type { User } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const BCRYPT_ROUNDS = 12;

export interface ProfileChanges {
  username?: string;
  email?: string;
  passwordHash?: string;
}

export interface ProfileRepository {
  findById(userId: number): Promise<User | null>;
  /** Throws EmailTakenError when another account already uses the email. */
  update(userId: number, changes: ProfileChanges): Promise<User | null>;
}

export class EmailTakenError extends Error {
  constructor() {
    super("That email is already used by another account");
    this.name = "EmailTakenError";
  }
}

const COLUMNS = "user_id, username, email, password_hash, google_sub, role, created_at";

const databaseProfileRepository: ProfileRepository = {
  async findById(userId) {
    return (await query<User>(`SELECT ${COLUMNS} FROM users WHERE user_id = $1`, [userId])).rows[0] ?? null;
  },
  async update(userId, changes) {
    try {
      const result = await query<User>(
        `UPDATE users
            SET username = COALESCE($2, username),
                email = COALESCE($3, email),
                password_hash = COALESCE($4, password_hash)
          WHERE user_id = $1
          RETURNING ${COLUMNS}`,
        [userId, changes.username ?? null, changes.email ?? null, changes.passwordHash ?? null],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      // 23505 = unique_violation (users.email is unique)
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") throw new EmailTakenError();
      throw error;
    }
  },
};

// Same rules as registration (routes/auth.ts).
const profileSchema = z
  .object({
    username: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z
      .string()
      .min(8)
      .refine((password) => Buffer.byteLength(password, "utf8") <= 72, { message: "Password must be at most 72 bytes" })
      .optional(),
  })
  .strict();

function serialize(user: User) {
  return {
    id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.created_at.toISOString(),
    /** Lets the profile page hide the password form for Google-only accounts. */
    signIn: { password: user.password_hash !== null, google: user.google_sub !== null },
  };
}

export interface ProfileRouterOptions {
  repository?: ProfileRepository;
}

export function createProfileRouter(options: ProfileRouterOptions = {}): Router {
  const router = Router();
  const repository = options.repository ?? databaseProfileRepository;

  router.use(authenticate, requireRole("user"));

  router.get("/", async (req, res, next) => {
    try {
      const user = await repository.findById(req.user!.userId);
      // The token is valid but the account is gone (deleted by an admin): treat as logged out.
      if (!user) return void res.status(401).json({ error: "Unauthorized" });
      res.json({ user: serialize(user) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (req, res, next) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid profile data", details: parsed.error.flatten().fieldErrors });
    }
    const { username, email, currentPassword, newPassword } = parsed.data;

    try {
      const user = await repository.findById(req.user!.userId);
      if (!user) return void res.status(401).json({ error: "Unauthorized" });

      const changes: ProfileChanges = {};
      if (username !== undefined && username !== user.username) changes.username = username;
      const emailChanged = email !== undefined && email !== user.email;
      if (emailChanged) changes.email = email;

      if (emailChanged || newPassword !== undefined) {
        if (user.password_hash === null) {
          return void res.status(400).json({
            error: "This account signs in with Google, so its email and password can't be changed here.",
          });
        }
        if (!currentPassword) {
          return void res.status(400).json({
            error: "Enter your current password to change your email or password.",
            details: { currentPassword: ["Current password is required"] },
          });
        }
        if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
          return void res.status(403).json({
            error: "Current password is incorrect.",
            details: { currentPassword: ["Current password is incorrect"] },
          });
        }
        if (newPassword !== undefined) changes.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      }

      if (Object.keys(changes).length === 0) return void res.json({ user: serialize(user) });

      const updated = await repository.update(user.user_id, changes);
      if (!updated) return void res.status(401).json({ error: "Unauthorized" });
      res.json({ user: serialize(updated) });
    } catch (error) {
      if (error instanceof EmailTakenError) {
        return void res.status(409).json({ error: error.message, details: { email: [error.message] } });
      }
      next(error);
    }
  });

  return router;
}
