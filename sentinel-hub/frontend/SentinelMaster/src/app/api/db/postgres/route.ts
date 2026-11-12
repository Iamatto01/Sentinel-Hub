import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
import { postgres } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Postgres databases on the host.
 *
 * `postgres()` already converts an unreachable server into a payload, so this
 * route never 5xx's for a machine that simply has no Postgres cluster.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  return ok({ data: await postgres() });
}
