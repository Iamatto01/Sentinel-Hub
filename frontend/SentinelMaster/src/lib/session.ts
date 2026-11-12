import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { env } from './env';

export const SESSION_COOKIE = 'sentinel_session';

export interface SessionPayload {
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Stable id so the session can be revoked and audited. */
  sid: string;
  /** Client fingerprint bound at login. */
  fp: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(body: string): string {
  const secret = env.sessionSecret;
  if (!secret) throw new Error('HUB_SESSION_SECRET is not configured');
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Derives the client fingerprint stored in the session. */
export function fingerprint(userAgent: string | null): string {
  return createHmac('sha256', env.sessionSecret ?? 'unconfigured')
    .update((userAgent ?? 'unknown').slice(0, 256))
    .digest('hex')
    .slice(0, 16);
}

/** Creates a signed `<body>.<signature>` token. */
export function createSession(
  userAgent: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): { token: string; payload: SessionPayload } {
  const payload: SessionPayload = {
    iat: nowSeconds,
    exp: nowSeconds + env.sessionTtlMinutes * 60,
    sid: randomUUID(),
    fp: fingerprint(userAgent),
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, payload };
}

export type SessionFailure =
  | 'missing'
  | 'malformed'
  | 'bad-signature'
  | 'expired'
  | 'fingerprint-mismatch'
  | 'unconfigured';

export type SessionResult =
  | { valid: true; payload: SessionPayload }
  | { valid: false; reason: SessionFailure };

/**
 * Verifies the signature first, then expiry, then the client fingerprint. The
 * signature is compared before the payload is parsed so tampered tokens never
 * reach JSON.parse.
 */
export function verifySession(token: string | undefined | null, userAgent: string | null): SessionResult {
  if (!token) return { valid: false, reason: 'missing' };
  if (!env.sessionSecret) return { valid: false, reason: 'unconfigured' };

  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { valid: false, reason: 'malformed' };

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return { valid: false, reason: 'unconfigured' };
  }
  if (!safeEqual(signature, expected)) return { valid: false, reason: 'bad-signature' };

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || typeof payload.sid !== 'string') {
    return { valid: false, reason: 'malformed' };
  }
  if (payload.exp * 1000 <= Date.now()) return { valid: false, reason: 'expired' };
  if (payload.iat * 1000 > Date.now() + 60_000) return { valid: false, reason: 'malformed' };
  if (payload.fp !== fingerprint(userAgent)) return { valid: false, reason: 'fingerprint-mismatch' };

  return { valid: true, payload };
}

/**
 * True when the client actually reached the Hub over TLS.
 *
 * `env.isProd` is **not** a valid proxy for this. The Hub runs a production build on Kali while
 * serving **plain HTTP** on `:3000` behind the tunnel. A `Secure` cookie over plain HTTP is
 * silently discarded by every browser, so login returned `200 {"ok":true}` and the very next
 * navigation bounced back to `/login?next=…` — the Hub was unusable on the LAN (defect N-14).
 *
 * Bound to `ALLOW_INSECURE_COOKIES=1` so the operator can force `Secure` on (strictest), but
 * the default is: follow the transport, never the build mode.
 */
export function isSecureRequest(request: NextRequest): boolean {
  if (env.allowInsecureCookies) return false;
  if (request.nextUrl.protocol === 'https:') return true;
  const proto = request.headers.get('x-forwarded-proto');
  return proto?.split(',')[0]?.trim().toLowerCase() === 'https';
}

/** Cookie attributes shared by the login and logout handlers. */
export function sessionCookieOptions(request: NextRequest): {
  httpOnly: true;
  sameSite: 'strict';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: env.sessionTtlMinutes * 60,
  };
}

/** Remaining session lifetime in seconds; 0 when expired. */
export function remainingSeconds(payload: SessionPayload): number {
  return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
}

/** Compares a submitted password against the configured one in constant time. */
export function passwordMatches(candidate: string): boolean {
  const expected = env.dashboardPassword;
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  const length = Math.max(a.length, b.length, 1);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);
  a.copy(paddedA);
  b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB) && a.length === b.length;
}
