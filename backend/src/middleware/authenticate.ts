import type { NextFunction, Request, Response } from "express";
import {
  bearerToken, isStateChanging, readCookie, requireCsrf,
  SESSION_COOKIE, verifySessionToken,
} from "../auth/sessionSecurity.js";

import type { User } from "../db/schema.js";

export interface AuthenticatedUser {
  userId: number;
  role: User["role"];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Unauthorized" });
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cookie = readCookie(req, SESSION_COOKIE);
  const token = cookie !== undefined ? cookie : bearerToken(req);
  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const payload = verifySessionToken(token);
    if (!payload) {
      unauthorized(res);
      return;
    }

    if (cookie !== undefined && isStateChanging(req) && !requireCsrf(req, res, token)) return;
    req.user = {
      userId: payload.userId,
      role: payload.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
