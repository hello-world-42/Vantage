import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const SESSION_COOKIE = "vantage_session";
const CSRF_COOKIE = "vantage_csrf";
const GUEST_CSRF_LIFETIME_MS = 10 * 60 * 1000;
const CSRF_ERROR = { error: "Invalid CSRF token or origin" };

export interface SessionClaims extends JwtPayload {
  userId: number;
  role: "user" | "admin";
  exp: number;
}

function secret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new Error("JWT_SECRET is required for authentication");
  return value;
}

export function frontendUrl(): URL {
  const url = new URL(process.env.CLIENT_URL?.trim() || "http://localhost:5173");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("CLIENT_URL must be an HTTP(S) frontend URL without credentials");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("CLIENT_URL must use HTTPS in production");
  }
  return url;
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/** Read only our string cookies. Duplicate or malformed values are invalid, not absent. */
export function readCookie(req: Request, name: string): string | undefined {
  const values = (req.get("cookie") ?? "").split(";")
    .map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length === 0) return undefined;
  if (values.length !== 1) return "";
  try {
    return decodeURIComponent(values[0].slice(name.length + 1));
  } catch {
    return "";
  }
}

export function verifySessionToken(token: string): SessionClaims | null {
  const key = secret();
  try {
    const claims = jwt.verify(token, key, { algorithms: ["HS256"] });
    if (typeof claims === "string" || !Number.isSafeInteger(claims.userId) || claims.userId <= 0
      || (claims.role !== "user" && claims.role !== "admin")
      || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

export function bearerToken(req: Request): string | undefined {
  return req.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
}

export function validCookieToken(req: Request): string | null {
  const token = readCookie(req, SESSION_COOKIE);
  return token && verifySessionToken(token) ? token : null;
}

export function setSessionCookie(res: Response, token: string): void {
  const claims = verifySessionToken(token);
  if (!claims) throw new Error("Cannot set an invalid or expired session");
  res.cookie(SESSION_COOKIE, token, {
    ...sessionCookieOptions(), maxAge: Math.max(0, claims.exp * 1000 - Date.now()),
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.clearCookie(CSRF_COOKIE, sessionCookieOptions());
}

function csrfProof(nonce: string, sessionToken: string | null): string {
  const context = sessionToken
    ? createHash("sha256").update(sessionToken).digest("base64url") : "guest";
  // The header authenticates both the random cookie nonce and this exact login session.
  const signature = createHmac("sha256", secret())
    .update(`vantage-csrf-v1:${context}:${nonce}`).digest("base64url");
  return `${nonce}.${signature}`;
}

/** Bootstrap may reuse its nonce so a refresh in another tab doesn't invalidate pending writes. */
export function issueCsrf(req: Request, res: Response, sessionToken: string | null, rotate = false): string {
  const existing = readCookie(req, CSRF_COOKIE);
  const nonce = !rotate && existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
    ? existing : randomBytes(32).toString("base64url");
  const claims = sessionToken ? verifySessionToken(sessionToken) : null;
  res.cookie(CSRF_COOKIE, nonce, {
    ...sessionCookieOptions(),
    maxAge: claims ? Math.max(0, claims.exp * 1000 - Date.now()) : GUEST_CSRF_LIFETIME_MS,
  });
  return csrfProof(nonce, sessionToken);
}

export function requireBrowserOrigin(req: Request, res: Response): boolean {
  if (req.get("origin") !== frontendUrl().origin) {
    res.status(403).json(CSRF_ERROR);
    return false;
  }
  return true;
}

export function requireCsrf(req: Request, res: Response, sessionToken: string | null): boolean {
  if (!requireBrowserOrigin(req, res)) return false;
  const nonce = readCookie(req, CSRF_COOKIE);
  const received = req.get("X-CSRF-Token");
  if (nonce && /^[A-Za-z0-9_-]{43}$/.test(nonce) && received) {
    const expected = Buffer.from(csrfProof(nonce, sessionToken));
    const actual = Buffer.from(received);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  res.status(403).json(CSRF_ERROR);
  return false;
}

export function isStateChanging(req: Request): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(req.method);
}
