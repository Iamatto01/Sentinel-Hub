import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { checkThrottle, clearFailures, clientKey, recordFailure } from '@/lib/authLock';
import { fail, clientIp, readJson } from '@/lib/http';import { createSession, passwordMatches, sessionCookieOptions, SESSION_COOKIE, remainingSeconds } from '@/lib/session';
import { env } from '@/lib/env';

interface LoginBody {
  password?: unknown;
}

function lockedResponse(verdict: { lockedUntil: number; retryAfterSeconds: number; remainingAttempts: number }) {
  const minutes = Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60));
  return NextResponse.json(
    {
      ok: false,
      error: `Too many failed attempts. Try again in ${minutes} minute(s).`,
      lockedUntil: new Date(verdict.lockedUntil).toISOString(),
      retryAfterSeconds: verdict.retryAfterSeconds,
    },
    { status: 429, headers: { 'retry-after': String(verdict.retryAfterSeconds) } },
  );
}

export async function POST(request: NextRequest) {
  if (!env.dashboardPassword || !env.sessionSecret) {
    return fail(503, 'The Hub is not fully configured yet', 'HUB_DASHBOARD_PASSWORD and HUB_SESSION_SECRET are required');
  }

  const body = await readJson<LoginBody>(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return fail(400, 'Password is required');
  if (password.length > 512) return fail(400, 'Password is too long');

  const userAgent = request.headers.get('user-agent');
  const key = clientKey(clientIp(request), userAgent);

  const before = await checkThrottle(key);
  if (!before.allowed) return lockedResponse(before);

  if (!passwordMatches(password)) {
    const after = await recordFailure(key);
    if (!after.allowed) return lockedResponse(after);
    return NextResponse.json(
      {
        ok: false,
        error: 'Wrong password',
        remainingAttempts: after.remainingAttempts,
      },
      { status: 401 },
    );
  }

  await clearFailures(key);

  const { token, payload } = createSession(userAgent);
  const response = NextResponse.json({
    ok: true,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    ttlSeconds: remainingSeconds(payload),
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return response;
}
