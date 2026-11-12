import type { NextRequest } from 'next/server';
import { fail } from './http';
import { verifySession, type SessionPayload, type SessionFailure } from './session';

/**
 * Server-side session enforcement for route handlers.
 *
 * `src/proxy.ts` already gates these paths at the edge, but the proxy only
 * decides whether a request may reach the app. Every handler re-checks here so
 * a matcher mistake, an internal rewrite or a direct PM2-loopback call cannot
 * bypass authentication.
 */

export type GuardResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: ReturnType<typeof fail> };

export function guard(request: NextRequest | Request): GuardResult {
  const result = verifySession(readCookie(request, 'sentinel_session'), request.headers.get('user-agent'));
  if (result.valid) return { ok: true, session: result.payload };

  const status = result.reason === 'unconfigured' ? 503 : 401;
  return { ok: false, response: fail(status, describe(result.reason)) };
}

/** Reads one cookie without depending on `NextRequest`, so plain `Request` handlers can be guarded too. */
function readCookie(request: NextRequest | Request, name: string): string | undefined {
  const jar = (request as NextRequest).cookies;
  if (jar && typeof jar.get === 'function') return jar.get(name)?.value;
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

function describe(reason: SessionFailure): string {
  switch (reason) {
    case 'missing':
      return 'Not authenticated';
    case 'expired':
      return 'Session expired, sign in again';
    case 'fingerprint-mismatch':
      return 'Session is bound to a different client, sign in again';
    case 'unconfigured':
      return 'HUB_SESSION_SECRET is not configured';
    default:
      return 'Session is not valid, sign in again';
  }
}

/** Parses a positive integer from a route segment, rejecting junk. */
export function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  if (!/^\d{1,12}$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
