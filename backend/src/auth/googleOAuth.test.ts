import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { User } from "../db/schema.js";
import * as googleOAuthModule from "./googleOAuth.js";

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

interface NewGoogleUser {
  username: string;
  email: string;
  googleSub: string;
  role: "user";
}

interface GoogleUserRepository {
  findByGoogleSub(sub: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  createGoogleUser(user: NewGoogleUser): Promise<User>;
}

const createGoogleOAuthProvider = (googleOAuthModule as unknown as {
  createGoogleOAuthProvider: () => {
    createAuthorizationRequest(): Promise<{
      authorizationUrl: string;
      state: string;
      codeVerifier: string;
    }>;
  };
}).createGoogleOAuthProvider;
const parseGoogleIdentity = (googleOAuthModule as unknown as {
  parseGoogleIdentity: (payload: Record<string, unknown>) => GoogleIdentity;
}).parseGoogleIdentity;
const resolveGoogleUser = (googleOAuthModule as unknown as {
  resolveGoogleUser: (
    identity: GoogleIdentity,
    repository: GoogleUserRepository,
  ) => Promise<User>;
}).resolveGoogleUser;

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const originalGoogleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/api/auth/google/callback";

after(() => {
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;

  if (originalGoogleClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;

  if (originalGoogleCallbackUrl === undefined) delete process.env.GOOGLE_CALLBACK_URL;
  else process.env.GOOGLE_CALLBACK_URL = originalGoogleCallbackUrl;
});

function user(overrides: Partial<User> = {}): User {
  return {
    user_id: 42,
    username: "Google User",
    email: "google@example.com",
    password_hash: null,
    google_sub: "google-subject-1",
    role: "user",
    created_at: new Date("2026-10-29T12:00:00.000Z"),
    ...overrides,
  };
}

test("Google authorization request includes state and an S256 PKCE challenge", async () => {
  const provider = createGoogleOAuthProvider();
  const request = await provider.createAuthorizationRequest();
  const authorizationUrl = new URL(request.authorizationUrl);

  assert.equal(authorizationUrl.origin, "https://accounts.google.com");
  assert.equal(authorizationUrl.searchParams.get("state"), request.state);
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorizationUrl.searchParams.get("code_challenge"));
  assert.ok(request.codeVerifier.length >= 43);
  assert.match(authorizationUrl.searchParams.get("scope") ?? "", /openid/);
  assert.match(authorizationUrl.searchParams.get("scope") ?? "", /email/);
});

test("Google identity requires a verified email and normalizes profile data", () => {
  const identity = parseGoogleIdentity({
    sub: "google-subject-1",
    email: "  USER@Example.com  ",
    email_verified: true,
    name: "  Google User  ",
  });

  assert.deepEqual(identity, {
    sub: "google-subject-1",
    email: "user@example.com",
    name: "Google User",
  });
  assert.throws(
    () =>
      parseGoogleIdentity({
        sub: "google-subject-2",
        email: "unverified@example.com",
        email_verified: false,
      }),
    /verified email/,
  );
});

test("Google account resolution returns an existing user by google_sub", async () => {
  const existingUser = user({ role: "admin" });
  let emailLookupCount = 0;
  let createCount = 0;
  const repository: GoogleUserRepository = {
    findByGoogleSub: async () => existingUser,
    findByEmail: async () => {
      emailLookupCount += 1;
      return null;
    },
    createGoogleUser: async () => {
      createCount += 1;
      return existingUser;
    },
  };

  const resolved = await resolveGoogleUser(
    { sub: "google-subject-1", email: "new-email@example.com", name: "New Name" },
    repository,
  );

  assert.equal(resolved, existingUser);
  assert.equal(resolved.role, "admin");
  assert.equal(emailLookupCount, 0);
  assert.equal(createCount, 0);
});

test("Google account resolution creates new accounts with only the user role", async () => {
  let createdUser: NewGoogleUser | undefined;
  const repository: GoogleUserRepository = {
    findByGoogleSub: async () => null,
    findByEmail: async () => null,
    createGoogleUser: async (newUser) => {
      createdUser = newUser;
      return user({
        username: newUser.username,
        email: newUser.email,
        google_sub: newUser.googleSub,
        role: newUser.role,
      });
    },
  };

  const resolved = await resolveGoogleUser(
    { sub: "new-google-subject", email: "new@example.com", name: "New Google User" },
    repository,
  );

  assert.deepEqual(createdUser, {
    username: "New Google User",
    email: "new@example.com",
    googleSub: "new-google-subject",
    role: "user",
  });
  assert.equal(resolved.role, "user");
});

test("Google account resolution refuses to auto-link an existing email account", async () => {
  let createCount = 0;
  const repository: GoogleUserRepository = {
    findByGoogleSub: async () => null,
    findByEmail: async () =>
      user({ password_hash: "bcrypt-hash", google_sub: null }),
    createGoogleUser: async () => {
      createCount += 1;
      return user();
    },
  };

  await assert.rejects(
    resolveGoogleUser(
      { sub: "new-google-subject", email: "google@example.com", name: "Google User" },
      repository,
    ),
    /already exists/,
  );
  assert.equal(createCount, 0);
});
