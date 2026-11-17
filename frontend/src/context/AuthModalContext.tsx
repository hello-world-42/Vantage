// Lets any component open the login/register dialog (top bar, Saved Locations, landing page).
import { createContext, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import AuthModal from '../components/auth/AuthModal';
import type { AuthMode } from '../components/auth/AuthModal';

export interface AuthModalContextValue {
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
}

export const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ mode: AuthMode; key: number } | null>(null);

  // A new key remounts the dialog, so opening it again always starts clean on the requested tab.
  const openAuth = useCallback((mode: AuthMode = 'login') => setOpen((prev) => ({ mode, key: (prev?.key ?? 0) + 1 })), []);
  const closeAuth = useCallback(() => setOpen(null), []);
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      {open && <AuthModal key={open.key} initialMode={open.mode} onClose={closeAuth} />}
    </AuthModalContext.Provider>
  );
}
