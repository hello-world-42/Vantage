import type { RequestHandler } from "express";

import type { AuthenticatedUser } from "./authenticate.js";

type UserRole = AuthenticatedUser["role"];

const ROLE_LEVEL = {
  user: 1,
  admin: 2,
} satisfies Record<UserRole, number>;

export function requireRole(requiredRole: UserRole): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[requiredRole]) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
