import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

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

function isAuthenticatedPayload(
  payload: string | JwtPayload,
): payload is JwtPayload & AuthenticatedUser & { exp: number } {
  return (
    typeof payload !== "string" &&
    Number.isInteger(payload.userId) &&
    payload.userId > 0 &&
    (payload.role === "user" || payload.role === "admin") &&
    typeof payload.exp === "number"
  );
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!bearerMatch) {
    unauthorized(res);
    return;
  }

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    next(new Error("JWT_SECRET is required to verify authentication tokens"));
    return;
  }

  try {
    const payload = jwt.verify(bearerMatch[1], secret, {
      algorithms: ["HS256"],
    });

    if (!isAuthenticatedPayload(payload)) {
      unauthorized(res);
      return;
    }

    req.user = {
      userId: payload.userId,
      role: payload.role,
    };
    next();
  } catch {
    unauthorized(res);
  }
}
