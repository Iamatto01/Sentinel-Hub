import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { checkThrottle, clientKey } from '@/lib/authLock';
import { clientIp } from '@/lib/http';
import { env } from '@/lib/env';
import { verifySession } from '@/lib/session';

/**
 * Lightweight polling endpoint for the login screen so the operator can see the
 * remaining attempt budget before submitting, and for the shell to confirm the
 * session is still alive without a full page load.
 */
export async function GET(request: NextRequest) {
  const session = verifySession(request.cookies.get('sentinel_session')?.value, request.headers.get('user-agent'));
  if (session.valid) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      expiresAt: new Date(session.payload.exp * 1000).toISOString(),
      expiresInSeconds: Math.max(0, session.payload.exp - Math.floor(Date.now() / 1000)),
    });
  }

  const verdict = await checkThrottle(clientKey(clientIp(request), request.headers.get('user-agent')));
  return NextResponse.json({
    ok: true,
    authenticated: false,
    reason: session.reason,
    maxAttempts: env.maxAttempts,
    remainingAttempts: verdict.remainingAttempts,
    lockedUntil: verdict.allowed ? null : new Date(verdict.lockedUntil).toISOString(),
    retryAfterSeconds: verdict.retryAfterSeconds,
  });
}
