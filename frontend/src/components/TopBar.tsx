import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAuthModal } from '../hooks/useAuthModal';
import Logo from './Logo';

/** Signed-in avatar (Figma screen 06): blue circle with the username's first letter, plus a small menu. */
function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!user) return null;
  const initial = (Array.from(user.username.trim())[0] ?? '?').toUpperCase();

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.username}`}
        className="grid size-9 place-items-center rounded-full bg-vt-blue text-sm font-semibold text-white hover:brightness-110"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-white/10 bg-vt-bar p-1 shadow-2xl">
          <div className="px-3 py-2">
            <p className="m-0 truncate text-sm font-medium text-white">{user.username}</p>
            <p className="m-0 truncate text-xs text-vt-muted">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-white/10" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** Top bar from the Figma screens: wordmark on the left; Log in / Register or the avatar on the right. */
export default function TopBar() {
  const { user } = useAuth();
  const { openAuth } = useAuthModal();

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-black/40 bg-vt-bar px-4 sm:px-7">
      <Logo />
      {user ? (
        <AccountMenu />
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => openAuth('login')} className="rounded-md bg-vt-field px-4 py-1.5 text-sm text-white hover:bg-[#474747]">
            Log in
          </button>
          <button
            type="button"
            onClick={() => openAuth('register')}
            className="rounded-md bg-vt-action px-4 py-1.5 text-sm font-medium text-white hover:bg-vt-action-hover"
          >
            Register
          </button>
        </div>
      )}
    </header>
  );
}
