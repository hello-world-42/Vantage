import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { ApiError, login, register } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import GoogleMark from './GoogleMark';

export type AuthMode = 'login' | 'register';

interface AuthModalProps {
  initialMode: AuthMode;
  onClose: () => void;
}

interface Fields {
  username: string;
  email: string;
  password: string;
}
type FieldName = keyof Fields;
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormMessage {
  text: string;
  hint?: string;
  /** Show a "Log in instead" button (email already registered). */
  offerLogin?: boolean;
}

const FIELD_ORDER: FieldName[] = ['username', 'email', 'password'];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]';
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

/** Mirrors the backend's zod rules (routes/auth.ts) so most mistakes are caught before a request. */
function validate(mode: AuthMode, fields: Fields): FieldErrors {
  const errors: FieldErrors = {};
  const email = fields.email.trim();
  if (mode === 'register') {
    const username = fields.username.trim();
    if (!username) errors.username = 'Enter a username.';
    else if (username.length > 100) errors.username = 'Use 100 characters or fewer.';
  }
  if (!email) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) errors.email = 'Enter a valid email address.';
  if (mode === 'login') {
    if (!fields.password) errors.password = 'Enter your password.';
  } else if (fields.password.length < 8) {
    errors.password = 'Use at least 8 characters.';
  } else if (passwordBytes(fields.password) > 72) {
    errors.password = 'Use a shorter password (72 bytes at most; some symbols count as more than one).';
  }
  return errors;
}

/** Turns an API failure into what the form should show. Never reveals whether an email exists on login. */
function describeError(error: unknown, mode: AuthMode): { fields?: FieldErrors; message?: FormMessage } {
  if (!(error instanceof ApiError)) {
    return { message: { text: "Can't reach the server. Check your connection and try again." } };
  }
  if (error.status === 400 && error.details) {
    const fields: FieldErrors = {};
    if (error.details.username) fields.username = 'Enter a username (up to 100 characters).';
    if (error.details.email) fields.email = 'Enter a valid email address.';
    if (error.details.password) fields.password = mode === 'register' ? 'Use 8 to 72 characters.' : 'Enter your password.';
    if (Object.keys(fields).length) return { fields };
  }
  switch (error.status) {
    case 400:
      return { message: { text: 'Check your details and try again.' } };
    case 401:
      return {
        message: {
          text: 'That email and password don’t match an account.',
          hint: 'If you signed up with Google, use Login with Google instead.',
        },
      };
    case 409:
      return { message: { text: 'An account with this email already exists.', offerLogin: true } };
    case 429:
      return { message: { text: 'Too many attempts. Wait a minute, then try again.' } };
    default:
      return {
        message: {
          text: error.status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : 'Something went wrong. Try again.',
        },
      };
  }
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete: string;
  inputMode?: 'email' | 'text';
  placeholder?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
}

function TextField({ id, label, value, error, hint, type = 'text', autoComplete, inputMode, placeholder, onChange, trailing }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      <div
        className={`flex items-center rounded-lg border bg-vt-field focus-within:ring-2 focus-within:ring-vt-blue ${
          error ? 'border-red-400/70' : 'border-transparent'
        }`}
      >
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-vt-muted focus:outline-none"
        />
        {trailing}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-xs text-vt-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Login / Register dialog (Figma screen 05: tabs, then Login with Google, then the form).
 * Email/password calls POST /api/auth/login and /register. Google is a full-page redirect to
 * GET /api/auth/google; see pages/AuthCallbackPage.tsx for the return trip.
 */
export default function AuthModal({ initialMode, onClose }: AuthModalProps) {
  const uid = useId();
  const { login: startSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fields, setFields] = useState<Fields>({ username: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const focusAfterSwitch = useRef<FieldName | null>(null);
  const fieldId = (name: FieldName) => `${uid}-${name}`;
  const tabId = (m: AuthMode) => `${uid}-tab-${m}`;

  // Open: focus the dialog, stop the page behind it from scrolling. Close: undo both, cancel any request.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      abortRef.current?.abort();
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (focusAfterSwitch.current) {
      document.getElementById(fieldId(focusAfterSwitch.current))?.focus();
      focusAfterSwitch.current = null;
    }
  });

  function update(name: FieldName) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFields((f) => ({ ...f, [name]: value }));
      if (fieldErrors[name]) setFieldErrors((errs) => ({ ...errs, [name]: undefined }));
    };
  }

  function switchMode(next: AuthMode, focusField?: FieldName) {
    if (next === mode) return;
    abortRef.current?.abort();
    setSubmitting(false);
    setMode(next);
    setFields((f) => ({ ...f, password: '' }));
    setFieldErrors({});
    setMessage(null);
    setInfo(null);
    setShowPassword(false);
    if (focusField) focusAfterSwitch.current = focusField;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const errors = validate(mode, fields);
    setFieldErrors(errors);
    setMessage(null);
    setInfo(null);
    const firstInvalid = FIELD_ORDER.find((name) => errors[name]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSubmitting(true);
    const email = fields.email.trim();
    let registered = false;

    try {
      if (mode === 'register') {
        await register(fields.username.trim(), email, fields.password, controller.signal);
        registered = true;
      }
      // /register returns no token, so a new account logs in right after.
      const session = await login(email, fields.password, controller.signal);
      startSession(session.token, session.user);
      onClose();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (registered) {
        // The account exists now; only the follow-up login failed.
        setMode('login');
        setInfo('Your account was created. Log in to continue.');
        return;
      }
      const { fields: serverFieldErrors, message: serverMessage } = describeError(error, mode);
      if (serverFieldErrors) {
        setFieldErrors(serverFieldErrors);
        const first = FIELD_ORDER.find((name) => serverFieldErrors[name]);
        if (first) document.getElementById(fieldId(first))?.focus();
      }
      if (serverMessage) setMessage(serverMessage);
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  function onDialogKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    // Keep keyboard focus inside the dialog.
    const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.tabIndex >= 0 && el !== dialogRef.current,
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next: AuthMode = e.key === 'Home' ? 'login' : e.key === 'End' ? 'register' : mode === 'login' ? 'register' : 'login';
    switchMode(next);
    document.getElementById(tabId(next))?.focus();
  }

  const isLogin = mode === 'login';
  const submitLabel = submitting ? (isLogin ? 'Logging in…' : 'Creating account…') : isLogin ? 'Log in' : 'Create account';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isLogin ? 'Log in to Vantage' : 'Create a Vantage account'}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className="w-full max-w-[30rem] rounded-2xl border border-white/10 bg-vt-bar px-5 pb-8 pt-5 text-slate-100 shadow-2xl focus:outline-none sm:px-6"
      >
        {/* Figma screen 05: Log in / Register tabs at the top left, close on the right. */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div role="tablist" aria-label="Account" onKeyDown={onTabKeyDown} className="flex gap-2.5">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                id={tabId(m)}
                type="button"
                role="tab"
                aria-selected={mode === m}
                aria-controls={`${uid}-panel`}
                tabIndex={mode === m ? 0 : -1}
                onClick={() => switchMode(m)}
                className={`w-28 rounded-lg py-2 text-sm font-medium ${
                  mode === m ? 'bg-vt-action text-white' : 'bg-vt-field text-vt-muted hover:text-white'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-vt-muted hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="sm:px-4">
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 no-underline hover:bg-slate-100"
          >
            <GoogleMark />
            Login with Google
          </a>

          <div className="my-5 flex items-center gap-3 text-xs text-vt-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={tabId(mode)}>
            <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!isLogin && (
                <TextField
                  id={fieldId('username')}
                  label="Username"
                  value={fields.username}
                  error={fieldErrors.username}
                  autoComplete="username"
                  onChange={update('username')}
                />
              )}
              <TextField
                id={fieldId('email')}
                label="Email"
                type="email"
                inputMode="email"
                value={fields.email}
                error={fieldErrors.email}
                placeholder="you@example.com"
                autoComplete="email"
                onChange={update('email')}
              />
              <TextField
                id={fieldId('password')}
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={fields.password}
                error={fieldErrors.password}
                hint={isLogin ? undefined : 'At least 8 characters.'}
                placeholder="••••••••"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                onChange={update('password')}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="mr-1 rounded-md px-2 py-1 text-xs text-vt-muted hover:text-white"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                }
              />

              {info && (
                <p role="status" className="m-0 rounded-lg bg-vt-blue/15 px-3 py-2 text-sm text-slate-100">
                  {info}
                </p>
              )}
              {message && (
                <div role="alert" className="flex flex-col items-start gap-1 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <span>{message.text}</span>
                  {message.hint && <span className="text-xs text-red-200/80">{message.hint}</span>}
                  {message.offerLogin && (
                    <button
                      type="button"
                      onClick={() => switchMode('login', 'password')}
                      className="mt-1 text-xs font-medium text-vt-blue-light underline underline-offset-2 hover:text-white"
                    >
                      Log in instead
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="mt-1 rounded-lg bg-vt-action py-2.5 text-sm font-semibold text-white hover:bg-vt-action-hover disabled:cursor-wait disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </form>

            <p className="m-0 mt-5 text-center text-sm text-vt-muted">
              {isLogin ? 'Don’t have an account?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(isLogin ? 'register' : 'login', isLogin ? 'username' : 'email')}
                className="ml-2 font-semibold text-vt-blue-light hover:text-white hover:underline"
              >
                {isLogin ? 'Register' : 'Log in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
