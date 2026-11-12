import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { describeDbError, inspect } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Length of a bridge id (`sha1(path)[:12]`). Rejects junk before shelling out. */
const ID_PATTERN = /^[0-9a-f]{12}$/;

/**
 * Full schema, integrity report, journal state and current lock holders for a
 * single database, addressed by registry id or absolute path.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id: raw } = await context.params;
  const id = decodeURIComponent(raw ?? '').trim();
  if (id.length === 0) return fail(400, 'A database id or path is required');
  if (!ID_PATTERN.test(id) && !looksLikePath(id)) {
    return fail(400, 'Expected a 12-character registry id or an absolute path');
  }

  try {
    return ok({ data: await inspect(id) });
  } catch (error) {
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}

/** Absolute POSIX or Windows path. The bridge resolves and validates it further. */
function looksLikePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}
