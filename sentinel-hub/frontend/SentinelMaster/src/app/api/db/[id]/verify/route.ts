import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { DbNotConfigured, dbConfigured, describeDbError, verify } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[0-9a-f]{12}$/;

/**
 * Cheap schema fingerprint for one database.
 *
 * `inspect` reads every row count and can take seconds on a 23 MB file. This
 * returns only the table/column shape plus a `fingerprint` hash and the file
 * `sha256`, which is what a drift check needs: store the fingerprint, compare it
 * later, and the moment a project alters its own database the hash changes.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = dbConfigured();
  if (!gate.ok) {
    return ok({ data: { configured: false, reason: gate.reason, id: null, fingerprint: null } });
  }

  const { id: raw } = await context.params;
  const id = decodeURIComponent(raw ?? '').trim();
  if (id.length === 0) return fail(400, 'A database id or path is required');
  if (!ID_PATTERN.test(id) && !id.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(id)) {
    return fail(400, 'Expected a 12-character registry id or an absolute path');
  }

  try {
    return ok({ data: { configured: true, ...(await verify(id)) } });
  } catch (error) {
    if (error instanceof DbNotConfigured) {
      return ok({ data: { configured: false, reason: error.message, id: null, fingerprint: null } });
    }
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}
