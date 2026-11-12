import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, toErrorResponse } from '@/lib/http';
import { invalidateProjectCache, scanProjectsWithRuntime } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const force = request.nextUrl.searchParams.get('force') === '1';
  try {
    // `force` refreshes the cached filesystem scan. The runtime binding is
    // always live and cannot be forced, because it is never cached.
    return ok({ data: await scanProjectsWithRuntime({ force }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** `POST /api/projects` with `{ action: 'rescan' }` drops the cache. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  invalidateProjectCache();
  try {
    return ok({ data: await scanProjectsWithRuntime() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
