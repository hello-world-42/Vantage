// Admin API (no UI): data-source switches and user management. Every route needs an admin token.
//
//   GET    /api/admin/data-sources          list providers and whether each is on
//   PATCH  /api/admin/data-sources/:id      { isEnabled: boolean }
//   GET    /api/admin/users                 list accounts (never password hashes)
//   PATCH  /api/admin/users/:id             { role: "user" | "admin" }
//   DELETE /api/admin/users/:id             delete an account and its saved locations
//
// To make the first admin, run in the database:  UPDATE users SET role = 'admin' WHERE email = '...';
// Role changes apply the next time that user logs in (the role is inside their token).
import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client.js";
import { listDataSources, setDataSourceEnabled } from "../db/dataSources.js";
import type { DataSource, User } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

type UserRow = Pick<User, "user_id" | "username" | "email" | "role" | "created_at"> & { has_password: boolean; has_google: boolean };

export interface AdminRepository {
  listDataSources(): Promise<DataSource[]>;
  setDataSourceEnabled(sourceId: number, isEnabled: boolean, updatedBy: number): Promise<DataSource | null>;
  listUsers(): Promise<UserRow[]>;
  setUserRole(userId: number, role: User["role"]): Promise<UserRow | null>;
  deleteUser(userId: number): Promise<boolean>;
}

const USER_COLUMNS = `user_id, username, email, role, created_at,
  (password_hash IS NOT NULL) AS has_password, (google_sub IS NOT NULL) AS has_google`;

const databaseAdminRepository: AdminRepository = {
  listDataSources,
  setDataSourceEnabled,
  async listUsers() {
    return (await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY user_id`)).rows;
  },
  async setUserRole(userId, role) {
    const result = await query<UserRow>(`UPDATE users SET role = $2 WHERE user_id = $1 RETURNING ${USER_COLUMNS}`, [userId, role]);
    return result.rows[0] ?? null;
  },
  async deleteUser(userId) {
    // Saved locations go with the account (ON DELETE CASCADE); data_sources.updated_by becomes NULL.
    const result = await query<{ user_id: number }>("DELETE FROM users WHERE user_id = $1 RETURNING user_id", [userId]);
    return result.rows.length > 0;
  },
};

export interface AdminRouterOptions {
  repository?: AdminRepository;
  /** Called after a provider is switched, so the aggregator re-reads the table right away. */
  onDataSourcesChanged?: () => void;
}

const idSchema = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).refine((n) => n <= 2_147_483_647);
const dataSourcePatchSchema = z.object({ isEnabled: z.boolean() }).strict();
const userPatchSchema = z.object({ role: z.enum(["user", "admin"]) }).strict();

const serializeDataSource = (source: DataSource) => ({
  id: source.source_id,
  name: source.name,
  category: source.category,
  isEnabled: source.is_enabled,
  updatedBy: source.updated_by,
  lastStatus: source.last_status,
  lastCheckedAt: source.last_checked_at?.toISOString() ?? null,
});

const serializeUser = (user: UserRow) => ({
  id: user.user_id,
  username: user.username,
  email: user.email,
  role: user.role,
  createdAt: user.created_at.toISOString(),
  signIn: { password: user.has_password, google: user.has_google },
});

export function createAdminRouter(options: AdminRouterOptions = {}): Router {
  const router = Router();
  const repository = options.repository ?? databaseAdminRepository;

  router.use(authenticate, requireRole("admin"));

  router.get("/data-sources", async (_req, res, next) => {
    try {
      res.json({ dataSources: (await repository.listDataSources()).map(serializeDataSource) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/data-sources/:id", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    const body = dataSourcePatchSchema.safeParse(req.body);
    if (!id.success) return void res.status(400).json({ error: "Invalid data source ID" });
    if (!body.success) return void res.status(400).json({ error: "Send { isEnabled: true } or { isEnabled: false }" });
    try {
      const updated = await repository.setDataSourceEnabled(id.data, body.data.isEnabled, req.user!.userId);
      if (!updated) return void res.status(404).json({ error: "Data source not found" });
      options.onDataSourcesChanged?.();
      res.json({ dataSource: serializeDataSource(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", async (_req, res, next) => {
    try {
      res.json({ users: (await repository.listUsers()).map(serializeUser) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/:id", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    const body = userPatchSchema.safeParse(req.body);
    if (!id.success) return void res.status(400).json({ error: "Invalid user ID" });
    if (!body.success) return void res.status(400).json({ error: 'Send { role: "user" } or { role: "admin" }' });
    // An admin can't remove their own admin role: that could leave the app with no admin.
    if (id.data === req.user!.userId && body.data.role !== "admin") {
      return void res.status(400).json({ error: "You can't remove your own admin role" });
    }
    try {
      const updated = await repository.setUserRole(id.data, body.data.role);
      if (!updated) return void res.status(404).json({ error: "User not found" });
      res.json({ user: serializeUser(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/:id", async (req, res, next) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return void res.status(400).json({ error: "Invalid user ID" });
    if (id.data === req.user!.userId) return void res.status(400).json({ error: "You can't delete your own account here" });
    try {
      if (!(await repository.deleteUser(id.data))) return void res.status(404).json({ error: "User not found" });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
