import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true, signedOut: true });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(request), maxAge: 0 });
  return response;
}
