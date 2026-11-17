import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError, getProfile, updateProfile } from '../api/client';
import TopBar from '../components/TopBar';
import { useAuth } from '../hooks/useAuth';
import { useAuthModal } from '../hooks/useAuthModal';
import { Link } from '../router';
import type { Profile } from '../types';

type Load = { status: 'loading' } | { status: 'ready'; profile: Profile } | { status: 'error' };
type Notice = { kind: 'success' | 'error'; text: string } | null;

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  error,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`rounded-lg border bg-vt-field px-3 py-2.5 text-sm text-white placeholder:text-vt-muted focus:outline-none focus:ring-2 focus:ring-vt-blue disabled:opacity-60 ${
          error ? 'border-red-400/70' : 'border-transparent'
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="m-0 text-xs text-red-300">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="m-0 text-xs text-vt-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-vt-bar p-6">
      <h2 className="m-0 mb-4 text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`m-0 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-red-500/10 text-red-200' : 'bg-emerald-500/10 text-emerald-200'}`}
    >
      {notice.text}
    </p>
  );
}

const SUBMIT = 'self-start rounded-lg bg-vt-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-vt-action-hover disabled:cursor-not-allowed disabled:opacity-50';

/** Account details (username, email) plus a change-password form. Lives at /profile. */
function ProfileForms({ profile, token, onSaved, onUnauthorized }: { profile: Profile; token: string; onSaved: (p: Profile) => void; onUnauthorized: () => void }) {
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [emailPassword, setEmailPassword] = useState('');
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string>>({});
  const [detailsNotice, setDetailsNotice] = useState<Notice>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const hasPassword = profile.signIn.password;
  const emailChanged = email.trim().toLowerCase() !== profile.email;
  const detailsChanged = emailChanged || username.trim() !== profile.username;

  /** Turns an API failure into field errors + a message. Returns true when it logged the user out. */
  function explain(err: unknown, setErrors: (e: Record<string, string>) => void, setNotice: (n: Notice) => void) {
    if (err instanceof ApiError && err.status === 401) {
      onUnauthorized();
      return;
    }
    if (err instanceof ApiError) {
      const fields: Record<string, string> = {};
      for (const [key, messages] of Object.entries(err.details ?? {})) if (messages[0]) fields[key] = messages[0];
      setErrors(fields);
      setNotice({ kind: 'error', text: err.status === 429 ? err.message : Object.keys(fields).length ? 'Check the highlighted fields.' : err.message });
    } else {
      setNotice({ kind: 'error', text: 'Couldn’t reach the server. Try again.' });
    }
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    setDetailsErrors({});
    setDetailsNotice(null);
    if (!username.trim()) return setDetailsErrors({ username: 'Enter a username' });
    if (emailChanged && !emailPassword) return setDetailsErrors({ currentPassword: 'Enter your password to change your email' });
    setSavingDetails(true);
    try {
      const saved = await updateProfile(token, {
        username: username.trim(),
        ...(emailChanged ? { email: email.trim(), currentPassword: emailPassword } : {}),
      });
      onSaved(saved);
      setUsername(saved.username);
      setEmail(saved.email);
      setEmailPassword('');
      setDetailsNotice({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      explain(err, setDetailsErrors, setDetailsNotice);
    } finally {
      setSavingDetails(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordNotice(null);
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password';
    if (newPassword.length < 8) errors.newPassword = 'Use at least 8 characters';
    else if (newPassword !== confirmPassword) errors.confirmPassword = 'The two passwords don’t match';
    if (Object.keys(errors).length) return setPasswordErrors(errors);
    setSavingPassword(true);
    try {
      onSaved(await updateProfile(token, { currentPassword, newPassword }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ kind: 'success', text: 'Password changed.' });
    } catch (err) {
      explain(err, setPasswordErrors, setPasswordNotice);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <Card title="Account details">
        <form onSubmit={saveDetails} noValidate className="flex flex-col gap-4">
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" error={detailsErrors.username} />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            error={detailsErrors.email}
            disabled={!hasPassword}
            hint={hasPassword ? undefined : 'This account signs in with Google, so its email is managed by Google.'}
          />
          {emailChanged && hasPassword && (
            <Field
              label="Your password (needed to change your email)"
              type="password"
              value={emailPassword}
              onChange={setEmailPassword}
              autoComplete="current-password"
              error={detailsErrors.currentPassword}
            />
          )}
          <NoticeLine notice={detailsNotice} />
          <button type="submit" disabled={savingDetails || !detailsChanged} className={SUBMIT}>
            {savingDetails ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </Card>

      {hasPassword && (
        <Card title="Change password">
          <form onSubmit={savePassword} noValidate className="flex flex-col gap-4">
            <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" error={passwordErrors.currentPassword} />
            <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" error={passwordErrors.newPassword} hint="At least 8 characters." />
            <Field label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" error={passwordErrors.confirmPassword} />
            <NoticeLine notice={passwordNotice} />
            <button type="submit" disabled={savingPassword} className={SUBMIT}>
              {savingPassword ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

export default function ProfilePage() {
  const { token, logout, updateUser } = useAuth();
  const { openAuth } = useAuthModal();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    getProfile(token, controller.signal)
      .then((profile) => setLoad({ status: 'ready', profile }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setLoad({ status: 'error' });
      });
    return () => controller.abort();
  }, [token, attempt, logout]);

  function saved(profile: Profile) {
    setLoad({ status: 'ready', profile });
    // Keep the avatar and menu in the top bar in step with the new name/email.
    updateUser({ id: profile.id, username: profile.username, email: profile.email, role: profile.role, createdAt: profile.createdAt });
  }

  let content: ReactNode;
  if (!token) {
    content = (
      <Card title="Log in to see your profile">
        <button type="button" onClick={() => openAuth('login')} className={SUBMIT}>
          Log in
        </button>
      </Card>
    );
  } else if (load.status === 'loading') {
    content = (
      <p role="status" className="m-0 text-sm text-vt-muted">
        Loading your profile…
      </p>
    );
  } else if (load.status === 'error') {
    content = (
      <Card title="Couldn’t load your profile">
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={SUBMIT}>
          Retry
        </button>
      </Card>
    );
  } else {
    const { profile } = load;
    content = (
      <>
        <p className="m-0 text-sm text-vt-muted">
          Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          {profile.role === 'admin' && ' · Admin'}
          {profile.signIn.google && ' · Signs in with Google'}
        </p>
        <ProfileForms profile={profile} token={token} onSaved={saved} onUnauthorized={logout} />
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-vt-page text-slate-100">
      <TopBar />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="m-0 text-2xl font-semibold text-white">Profile</h1>
          <Link to="/globe" className="text-sm text-vt-blue-light no-underline hover:text-white hover:underline">
            ← Back to the globe
          </Link>
        </div>
        {content}
      </main>
    </div>
  );
}
