// Minimal session holder: keeps the JWT + user so protected features (Saved Locations) can use them.
// There is no login UI yet. The login/register modal should call `login(token, user)` with the
// `{ token, user }` body returned by POST /api/auth/login (or the Google callback).
import { createContext, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '../types';

const STORAGE_KEY = 'vantage.auth';

interface Session {
  token: string;
  user: AuthUser;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === 'string' && parsed.user && typeof parsed.user === 'object') {
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    /* storage unavailable or corrupted: treat as logged out */
  }
  return null;
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const login = useCallback((token: string, user: AuthUser) => {
    const next = { token, user };
    saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, token: session?.token ?? null, login, logout }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
