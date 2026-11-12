import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, toErrorResponse } from '@/lib/http';
import { routerSnapshot } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live read-only picture of the Sentinel Router gateway: connections, combos, globs, routing. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    return ok({ data: await routerSnapshot() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
