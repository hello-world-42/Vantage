import { useEffect, useRef, useState } from 'react';
import TopBar from '../components/TopBar';
import { useAuth } from '../hooks/useAuth';
import { useAuthModal } from '../hooks/useAuthModal';
import { decodeBase64Url, isTokenExpired } from '../lib/jwt';
import { Link, navigate } from '../router';
import type { AuthUser } from '../types';

/*
 * Where Google login lands: /auth/callback#token=<jwt>&user=<base64url JSON user>
 * or /auth/callback#error=<code>. The values ride in the URL *fragment* so they never reach a server log.
 *
 * NOT LIVE YET: the backend callback (backend/src/routes/auth.ts, Aamir) still answers with JSON
 * instead of redirecting here. See SPEC.md Section 7 for the proposed change.
 */

const ERROR_MESSAGES: Record<string, string> = {
  conflict: 'An account with this email already exists. Log in with your email and password instead.',
  failed: 'Google couldn’t confirm your account. Try again.',
  state: 'The login link expired or was opened in another browser. Try again.',
};
const GENERIC_ERROR = 'Google login didn’t finish. Try again.';

function parseUser(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(decodeBase64Url(raw)) as Record<string, unknown>;
    if (
      typeof u.id === 'number' &&
      typeof u.username === 'string' &&
      typeof u.email === 'string' &&
      (u.role === 'user' || u.role === 'admin') &&
      typeof u.createdAt === 'string'
    ) {
      return { id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const { openAuth } = useAuthModal();
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return; // StrictMode runs effects twice in development
    handled.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    // Take the token out of the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname);

    const code = params.get('error');
    if (code) {
      setError(ERROR_MESSAGES[code] ?? GENERIC_ERROR);
      return;
    }
    const token = params.get('token');
    const user = parseUser(params.get('user'));
    if (!token || token.split('.').length !== 3 || isTokenExpired(token) || !user) {
      setError(GENERIC_ERROR);
      return;
    }
    login(token, user);
    navigate('/globe', { replace: true });
  }, [login]);

  return (
    <div className="flex min-h-dvh flex-col bg-vt-page text-slate-100">
      <TopBar />
      <main className="grid flex-1 place-items-center p-4">
        {error ? (
          <div role="alert" className="w-full max-w-sm rounded-2xl border border-white/10 bg-vt-bar p-6">
            <h1 className="m-0 text-lg font-semibold text-white">Couldn’t log you in</h1>
            <p className="m-0 mt-2 text-sm leading-relaxed text-vt-muted">{error}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="rounded-lg bg-vt-action px-4 py-2 text-sm font-semibold text-white hover:bg-vt-action-hover"
              >
                Try again
              </button>
              <Link to="/globe" className="rounded-lg bg-vt-field px-4 py-2 text-sm text-white no-underline hover:bg-[#474747]">
                Go to the globe
              </Link>
            </div>
          </div>
        ) : (
          <p role="status" className="m-0 text-sm text-vt-muted">
            Logging you in…
          </p>
        )}
      </main>
    </div>
  );
}
