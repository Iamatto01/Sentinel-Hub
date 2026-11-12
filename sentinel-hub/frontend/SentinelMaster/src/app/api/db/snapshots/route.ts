import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { DbNotConfigured, dbConfigured, describeDbError, snapshots } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lists the snapshots already on disk, newest first, so a restore is findable. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = dbConfigured();
  if (!gate.ok) {
    return ok({ data: { configured: false, reason: gate.reason, dir: '', count: 0, snapshots: [] } });
  }

  const dir = request.nextUrl.searchParams.get('dir')?.trim() || undefined;

  try {
    return ok({ data: { configured: true, ...(await snapshots({ dir })) } });
  } catch (error) {
    if (error instanceof DbNotConfigured) {
      return ok({ data: { configured: false, reason: error.message, dir: '', count: 0, snapshots: [] } });
    }
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}
