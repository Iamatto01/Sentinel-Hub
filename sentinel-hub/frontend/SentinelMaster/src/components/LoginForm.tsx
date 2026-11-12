'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, apiPost, apiRaw } from './api';
import SentinelLogo from './SentinelLogo';

interface SessionProbe {
  authenticated: boolean;
  reason?: string;
  maxAttempts?: number;
  remainingAttempts?: number;
  lockedUntil?: number;
  retryAfterSeconds?: number;
}

interface Throttle {
  remainingAttempts: number;
  maxAttempts: number;
  lockedUntil: number | null;
}

const FALLBACK_MAX_ATTEMPTS = 5;

/** Keeps `?next=` pointed at an in-app path, never an absolute URL. */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.startsWith('/login') || raw.startsWith('/api/auth/')) return '/';
  return raw;
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => safeNext(params.get('next')), [params]);

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);
  const [throttle, setThrottle] = useState<Throttle>({
    remainingAttempts: FALLBACK_MAX_ATTEMPTS,
    maxAttempts: FALLBACK_MAX_ATTEMPTS,
    lockedUntil: null,
  });
  const [unconfigured, setUnconfigured] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const applyProbe = useCallback((probe: SessionProbe) => {
    const maxAttempts = probe.maxAttempts ?? FALLBACK_MAX_ATTEMPTS;
    setThrottle({
      maxAttempts,
      remainingAttempts: Math.max(0, Math.min(maxAttempts, probe.remainingAttempts ?? maxAttempts)),
      lockedUntil: probe.lockedUntil ?? null,
    });
    if (probe.reason === 'unconfigured') setUnconfigured(true);
  }, []);

  // Enforce obsidian dark theme on authentication portal
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  // Seed the attempt budget and detect an already-valid session.
  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const { status, body } = await apiRaw('/api/auth/session');
      if (cancelled) return;
      const payload = (body ?? {}) as SessionProbe & { error?: string };

      if (status === 503) {
        setUnconfigured(true);
        setError(payload.error ?? 'The Hub is not configured yet. Set HUB_DASHBOARD_PASSWORD and HUB_SESSION_SECRET.');
        return;
      }
      if (payload.authenticated) {
        router.replace(next);
        return;
      }
      applyProbe(payload);
    };

    void probe();
    const timer = setInterval(() => void probe(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyProbe, next, router]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node || unconfigured) return;
    node.focus();
  }, [unconfigured]);

  // Lockout countdown derived from the server's absolute `lockedUntil`.
  useEffect(() => {
    const tick = () => {
      setLockedFor((current) => {
        const remaining = throttle.lockedUntil ? Math.ceil((throttle.lockedUntil - Date.now()) / 1000) : 0;
        const nextValue = Math.max(0, remaining);
        return nextValue === current ? current : nextValue;
      });
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [throttle.lockedUntil]);

  const locked = lockedFor > 0;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || locked || unconfigured) return;

    const candidate = password;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiPost<{ expiresAt: number; ttlSeconds: number }>('/api/auth/login', { password: candidate });
      setPassword('');
      setNotice('Access granted — opening the Hub…');
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setPassword('');
      if (caught instanceof ApiError) {
        const body = (caught.body ?? {}) as { remainingAttempts?: number; lockedUntil?: number; retryAfterSeconds?: number };

        if (caught.status === 429) {
          const until = body.lockedUntil ?? Date.now() + (body.retryAfterSeconds ?? 0) * 1000;
          setThrottle((current) => ({ ...current, remainingAttempts: 0, lockedUntil: until }));
          setError(caught.message);
        } else if (caught.status === 503) {
          setUnconfigured(true);
          setError(caught.message);
        } else {
          const remaining = Math.max(0, body.remainingAttempts ?? Math.max(0, throttle.remainingAttempts - 1));
          setThrottle((current) => ({ ...current, remainingAttempts: remaining }));
          setError(remaining > 0 ? `Wrong password. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` : caught.message);
        }
      } else {
        setError(caught instanceof Error ? caught.message : 'Sign-in failed');
      }
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const pips = useMemo(
    () => Array.from({ length: throttle.maxAttempts }, (_, index) => index < throttle.maxAttempts - throttle.remainingAttempts),
    [throttle.maxAttempts, throttle.remainingAttempts],
  );

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} autoComplete="off">
        <div className="login-mark" aria-hidden>
          <SentinelLogo size={52} />
        </div>
        <h1>Sentinel Master Hub</h1>
        <p>Private control plane. Authorised operators only.</p>

        {unconfigured ? (
          <div className="alert error" style={{ marginBottom: 16 }}>
            <span>
              This instance is not configured. Set <code className="mono">HUB_DASHBOARD_PASSWORD</code> and a 32+ character{' '}
              <code className="mono">HUB_SESSION_SECRET</code>, then restart the service.
            </span>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="hub-password">Access password</label>
          <input
            id="hub-password"
            ref={inputRef}
            className="input"
            type="password"
            name="sentinel-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••••"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={512}
            disabled={busy || locked || unconfigured}
            aria-describedby="hub-attempts"
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="btn primary block" type="submit" disabled={busy || locked || unconfigured || password.length === 0}>
            {busy ? <span className="spinner" /> : null}
            {locked ? `Locked — ${Math.floor(lockedFor / 60)}m ${lockedFor % 60}s` : busy ? 'Verifying…' : 'Unlock Hub'}
          </button>
        </div>

        <div className="login-attempts" id="hub-attempts">
          <span className="nowrap">Attempts left</span>
          <span className="row" style={{ gap: 5 }}>
            {pips.map((used, index) => (
              <span key={index} className={used ? 'pip used' : 'pip'} />
            ))}
          </span>
          <span className="mono nowrap" style={{ marginLeft: 'auto' }}>
            {throttle.remainingAttempts}/{throttle.maxAttempts}
          </span>
        </div>

        {error ? (
          <div className="alert error" style={{ marginTop: 14 }} role="alert">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="alert ok" style={{ marginTop: 14 }}>
            {notice}
          </div>
        ) : null}

        <p className="faint" style={{ fontSize: 11, marginTop: 18, marginBottom: 0 }}>
          Five failed attempts lock this client for the configured window. Attempts are recorded on the server, so restarting
          the service does not reset them.
        </p>
      </form>
    </div>
  );
}
