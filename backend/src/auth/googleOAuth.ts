import { randomBytes } from "node:crypto";

import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from "google-auth-library";

import { query } from "../db/client.js";
import type { User } from "../db/schema.js";

const USER_COLUMNS =
  "user_id, username, email, password_hash, google_sub, role, created_at";

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

export interface GoogleAuthorizationRequest {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export interface GoogleOAuthProvider {
  createAuthorizationRequest(): Promise<GoogleAuthorizationRequest>;
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleIdentity>;
}

interface NewGoogleUser {
  username: string;
  email: string;
  googleSub: string;
  role: "user";
}

export interface GoogleUserRepository {
  findByGoogleSub(sub: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  createGoogleUser(user: NewGoogleUser): Promise<User>;
}

export class GoogleAuthenticationError extends Error {
  constructor(message = "Google authentication failed") {
    super(message);
    this.name = "GoogleAuthenticationError";
  }
}

export class GoogleAccountConflictError extends Error {
  constructor(message = "An account with this email already exists") {
    super(message);
    this.name = "GoogleAccountConflictError";
  }
}

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

function requireGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL are required",
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

function createGoogleClient(): { client: OAuth2Client; config: GoogleOAuthConfig } {
  const config = requireGoogleOAuthConfig();
  return {
    client: new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.callbackUrl,
    ),
    config,
  };
}

export function parseGoogleIdentity(payload: TokenPayload): GoogleIdentity {
  const sub = payload.sub?.trim();
  const email = payload.email?.trim().toLowerCase();

  if (!sub || !email || email.length > 255 || payload.email_verified !== true) {
    throw new GoogleAuthenticationError(
      "Google identity must include a verified email",
    );
  }

  const fallbackName = email.split("@")[0] || "Google User";
  const name = (payload.name?.trim() || fallbackName).slice(0, 100);

  return { sub, email, name };
}

export function createGoogleOAuthProvider(): GoogleOAuthProvider {
  return {
    async createAuthorizationRequest() {
      const { client } = createGoogleClient();
      const { codeVerifier, codeChallenge } =
        await client.generateCodeVerifierAsync();
      const state = randomBytes(32).toString("base64url");
      const authorizationUrl = client.generateAuthUrl({
        access_type: "online",
        scope: ["openid", "email", "profile"],
        prompt: "select_account",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });

      return { authorizationUrl, state, codeVerifier };
    },

    async exchangeCode(code, codeVerifier) {
      const { client, config } = createGoogleClient();

      try {
        const tokenResponse = await client.getToken({
          code,
          codeVerifier,
          redirect_uri: config.callbackUrl,
        });
        const idToken = tokenResponse.tokens.id_token;
        if (!idToken) {
          throw new GoogleAuthenticationError();
        }

        const ticket = await client.verifyIdToken({
          idToken,
          audience: config.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload) {
          throw new GoogleAuthenticationError();
        }

        return parseGoogleIdentity(payload);
      } catch (error) {
        if (error instanceof GoogleAuthenticationError) throw error;
        throw new GoogleAuthenticationError();
      }
    },
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

const databaseGoogleUserRepository: GoogleUserRepository = {
  async findByGoogleSub(sub) {
    const result = await query<User>(
      `SELECT ${USER_COLUMNS}
       FROM users
       WHERE google_sub = $1
       LIMIT 1`,
      [sub],
    );
    return result.rows[0] ?? null;
  },

  async findByEmail(email) {
    const result = await query<User>(
      `SELECT ${USER_COLUMNS}
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  },

  async createGoogleUser(user) {
    const result = await query<User>(
      `INSERT INTO users (username, email, password_hash, google_sub, role)
       VALUES ($1, $2, NULL, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [user.username, user.email, user.googleSub, user.role],
    );
    const createdUser = result.rows[0];
    if (!createdUser) {
      throw new Error("Google registration did not return the created user");
    }
    return createdUser;
  },
};

export async function resolveGoogleUser(
  identity: GoogleIdentity,
  repository: GoogleUserRepository = databaseGoogleUserRepository,
): Promise<User> {
  const existingGoogleUser = await repository.findByGoogleSub(identity.sub);
  if (existingGoogleUser) return existingGoogleUser;

  const existingEmailUser = await repository.findByEmail(identity.email);
  if (existingEmailUser) throw new GoogleAccountConflictError();

  try {
    return await repository.createGoogleUser({
      username: identity.name,
      email: identity.email,
      googleSub: identity.sub,
      role: "user",
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;

    // A concurrent callback for the same Google account may have won the insert.
    const concurrentlyCreatedUser = await repository.findByGoogleSub(
      identity.sub,
    );
    if (concurrentlyCreatedUser) return concurrentlyCreatedUser;

    // Any other uniqueness collision must not silently link by email.
    throw new GoogleAccountConflictError();
  }
}
