import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { describeKaliError, checkDatabaseHealth, cleanOrphanProcesses } from '@/lib/kali';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Retrieves health & integrity status of fyp2.db. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const data = await checkDatabaseHealth();
    return ok({ data });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}

/** Triggers cleanup of zombie/orphan processes. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const data = await cleanOrphanProcesses();
    return ok({ data });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}
