import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { describeDbError, compare } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[0-9a-f]{12}$/;

/**
 * Structural and content diff between two databases.
 *
 * This is the answer to "project database always been alter": pair the two
 * copies of a duplicated file and see exactly which tables, columns and rows
 * moved. Takes `?left=` and `?right=`, each a registry id or absolute path.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const left = (params.get('left') ?? '').trim();
  const right = (params.get('right') ?? '').trim();

  for (const [label, value] of [['left', left], ['right', right]] as const) {
    if (value.length === 0) return fail(400, `The ${label} database is required`);
    if (!ID_PATTERN.test(value) && !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value)) {
      return fail(400, `The ${label} value must be a 12-character id or an absolute path`);
    }
  }
  if (left === right) return fail(400, 'Pick two different databases to compare');

  try {
    return ok({ data: await compare(left, right) });
  } catch (error) {
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}
