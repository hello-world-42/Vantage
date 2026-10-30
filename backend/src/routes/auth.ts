import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import { timingSafeEqual } from "node:crypto";
import {
  Router,
  type CookieOptions,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";

import {
  createGoogleOAuthProvider,
  GoogleAccountConflictError,
  GoogleAuthenticationError,
  resolveGoogleUser as resolveGoogleUserFromDatabase,
  type GoogleIdentity,
  type GoogleOAuthProvider,
} from "../auth/googleOAuth.js";
import { query } from "../db/client.js";
import type { User } from "../db/schema.js";

const BCRYPT_SALT_ROUNDS = 12;
const GOOGLE_OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
const GOOGLE_STATE_COOKIE = "vantage_google_state";
const GOOGLE_VERIFIER_COOKIE = "vantage_google_verifier";
const GOOGLE_COOKIE_PATH = "/api/auth/google";

const registrationSchema = z.object({
  username: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(8)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must be at most 72 bytes",
    }),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

type RegisteredUserRow = Pick<
  User,
  "user_id" | "username" | "email" | "role" | "created_at"
>;

interface NewUserRecord {
  username: string;
  email: string;
  passwordHash: string;
  role: "user";
}

type InsertUser = (user: NewUserRecord) => Promise<RegisteredUserRow>;
type FindUserByEmail = (email: string) => Promise<User | null>;

export interface AuthRouterOptions {
  insertUser?: InsertUser;
  findUserByEmail?: FindUserByEmail;
  googleOAuth?: GoogleOAuthProvider;
  resolveGoogleUser?: (identity: GoogleIdentity) => Promise<User>;
}

async function insertUserIntoDatabase(user: NewUserRecord): Promise<RegisteredUserRow> {
  const result = await query<RegisteredUserRow>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, username, email, role, created_at`,
    [user.username, user.email, user.passwordHash, user.role],
  );

  const createdUser = result.rows[0];
  if (!createdUser) {
    throw new Error("User registration did not return the created user");
  }

  return createdUser;
}

async function findUserByEmailInDatabase(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT user_id, username, email, password_hash, google_sub, role, created_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

function signUserToken(user: User): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required to sign authentication tokens");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN?.trim();
  if (!expiresIn) {
    throw new Error("JWT_EXPIRES_IN is required to sign authentication tokens");
  }

  return jwt.sign(
    { userId: user.user_id, role: user.role },
    secret,
    {
      algorithm: "HS256",
      expiresIn: expiresIn as SignOptions["expiresIn"],
    },
  );
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function googleCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_MS,
    path: GOOGLE_COOKIE_PATH,
  };
}

function clearGoogleOAuthCookies(res: Response): void {
  const { maxAge: _maxAge, signed: _signed, ...clearOptions } =
    googleCookieOptions();
  res.clearCookie(GOOGLE_STATE_COOKIE, clearOptions);
  res.clearCookie(GOOGLE_VERIFIER_COOKIE, clearOptions);
}

function signedGoogleCookieParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    next(new Error("JWT_SECRET is required for Google OAuth cookies"));
    return;
  }

  cookieParser(secret)(req, res, next);
}

function getQueryString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function statesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function sanitizedUser(user: RegisteredUserRow) {
  return {
    id: user.user_id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.created_at.toISOString(),
  };
}

export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router();
  const insertUser = options.insertUser ?? insertUserIntoDatabase;
  const findUserByEmail = options.findUserByEmail ?? findUserByEmailInDatabase;
  const googleOAuth = options.googleOAuth ?? createGoogleOAuthProvider();
  const resolveGoogleUser =
    options.resolveGoogleUser ?? resolveGoogleUserFromDatabase;

  router.post("/register", async (req, res, next) => {
    const parsedInput = registrationSchema.safeParse(req.body);
    if (!parsedInput.success) {
      res.status(400).json({
        error: "Invalid registration data",
        details: parsedInput.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const { username, email, password } = parsedInput.data;
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      const user = await insertUser({
        username,
        email,
        passwordHash,
        role: "user",
      });

      res.status(201).json({
        user: sanitizedUser(user),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        res.status(409).json({
          error: "An account with this email already exists",
        });
        return;
      }

      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    const parsedInput = loginSchema.safeParse(req.body);
    if (!parsedInput.success) {
      res.status(400).json({
        error: "Invalid login data",
        details: parsedInput.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const { email, password } = parsedInput.data;
      const user = await findUserByEmail(email);
      const passwordMatches = user?.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!user || !passwordMatches) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const token = signUserToken(user);
      res.json({
        token,
        user: sanitizedUser(user),
      });
    } catch (error) {
      next(error);
    }
  });

  router.use("/google", signedGoogleCookieParser);

  router.get("/google", async (_req, res, next) => {
    try {
      const { authorizationUrl, state, codeVerifier } =
        await googleOAuth.createAuthorizationRequest();
      const cookieOptions = googleCookieOptions();
      res.cookie(GOOGLE_STATE_COOKIE, state, cookieOptions);
      res.cookie(GOOGLE_VERIFIER_COOKIE, codeVerifier, cookieOptions);
      res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get("/google/callback", async (req, res, next) => {
    const code = getQueryString(req.query.code);
    const receivedState = getQueryString(req.query.state);
    const signedCookies = req.signedCookies as
      | Record<string, string | false | undefined>
      | undefined;
    const expectedState = signedCookies?.[GOOGLE_STATE_COOKIE];
    const codeVerifier = signedCookies?.[GOOGLE_VERIFIER_COOKIE];

    clearGoogleOAuthCookies(res);

    if (
      typeof expectedState !== "string" ||
      typeof receivedState !== "string" ||
      !statesMatch(expectedState, receivedState) ||
      typeof codeVerifier !== "string"
    ) {
      res.status(400).json({ error: "Invalid OAuth state" });
      return;
    }

    if (!code) {
      res.status(400).json({ error: "Google authorization code is required" });
      return;
    }

    try {
      const identity = await googleOAuth.exchangeCode(code, codeVerifier);
      const user = await resolveGoogleUser(identity);
      const token = signUserToken(user);

      res.json({ token, user: sanitizedUser(user) });
    } catch (error) {
      if (error instanceof GoogleAuthenticationError) {
        res.status(401).json({ error: "Google authentication failed" });
        return;
      }
      if (error instanceof GoogleAccountConflictError) {
        res
          .status(409)
          .json({ error: "An account with this email already exists" });
        return;
      }
      next(error);
    }
  });

  return router;
}

export const authRouter = createAuthRouter();
