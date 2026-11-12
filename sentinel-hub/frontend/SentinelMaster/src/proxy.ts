/**
 * Edge-side gate.
 *
 * Next.js 16 replaced `middleware.ts` with `proxy.ts`. Everything except
 * `/login`, the auth endpoints, static assets and the health probe requires a
 * valid signed session cookie. API routes are excluded from the matcher so they
 * can return JSON 401s instead of HTML redirects, and each one re-checks the
 * session itself — the proxy is a convenience, never the only defence.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'sentinel_session';

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/healthz',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
]);

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false;

  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBytes = base64UrlToBytes(signature);
  if (!signatureBytes) return false;

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as unknown as ArrayBuffer,
    new TextEncoder().encode(body),
  );
  if (!valid) return false;

  const payloadBytes = base64UrlToBytes(body);
  if (!payloadBytes) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    // A live session should never see the login screen again.
    if (pathname === '/login') {
      const secret = process.env.HUB_SESSION_SECRET ?? '';
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (await verifyToken(token, secret)) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.next();
  }

  const secret = process.env.HUB_SESSION_SECRET ?? '';
  if (!secret) {
    // Without a signing secret every session is untrustworthy; fail closed.
    return new NextResponse(
      'Sentinel Master Hub is not configured: HUB_SESSION_SECRET is missing.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyToken(token, secret)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Not authenticated' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname);
  const response = NextResponse.redirect(login);
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/projects/:path*',
    '/github/:path*',
    '/fame/:path*',
    '/autobot/:path*',
    '/kali/:path*',
    '/databases/:path*',
    '/touch/:path*',
    '/voice-studio/:path*',
    '/opencut/:path*',
    '/hyperframes/:path*',
    '/grok-bot/:path*',
    '/god-view/:path*',
    '/synergy/:path*',
    '/settings/:path*',
    '/router/:path*',
    '/cybermaster/:path*',
    '/api/:path*',
  ],
};

export default proxy;
