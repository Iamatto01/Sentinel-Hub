import { NextResponse } from 'next/server';
import { guard } from '@/lib/guard';
import { hubDiagnostics } from '@/lib/overview';
import { ok, toErrorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Runtime diagnostics for the Settings page. Never exposes secret values. */
export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    return ok(hubDiagnostics());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function POST() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
