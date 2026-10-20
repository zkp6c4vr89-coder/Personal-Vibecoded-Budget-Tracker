import { useState, type FormEvent } from 'react';
import { Button, ErrorBanner, inputClass } from '../components/ui';
import { useApp } from '../state/AppContext';

export default function Login() {
  const { login } = useApp();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    setRetryAfter(null);
    try {
      await login(password);
      setPassword('');
    } catch (err: any) {
      if (err?.status === 429) setRetryAfter(60);
      setError(err?.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-3xl text-white shadow-lg">
            $
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Budget Tracker</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter your password to continue
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              className={`${inputClass} pr-16`}
              aria-label="Password"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 active:bg-slate-100 dark:active:bg-slate-800"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <Button type="submit" loading={busy} disabled={!password} className="w-full py-3">
            Sign in
          </Button>
        </form>

        {retryAfter !== null && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Too many attempts — the server is rate limiting sign-ins for a few minutes.
          </p>
        )}
        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          Sessions last 30 days on this device.
        </p>
      </div>
    </div>
  );
}