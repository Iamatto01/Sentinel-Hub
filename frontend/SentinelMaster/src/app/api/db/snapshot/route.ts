import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { DbNotConfigured, dbConfigured, describeDbError, snapshot } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[0-9a-f]{12}$/;

/**
 * Takes a consistent, self-verified copy of one database.
 *
 * This exists because a plain file copy of a WAL-mode database silently drops
 * every transaction still sitting in the write-ahead log — measured on this host,
 * a copy of `fyp2.db` reads 5,783 rows where the live database holds 5,792. The
 * bridge writes snapshots with `VACUUM INTO` and reopens the result to count it,
 * so a snapshot that fails verification is deleted rather than left on disk as
 * false safety.
 *
 * This is the only supported backup path; nothing here ever writes to the source
 * database, whose handle is opened read-only.
 */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = dbConfigured();
  if (!gate.ok) return fail(503, gate.reason ?? 'The database bridge is not configured');

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'A JSON body with a `target` is required');
  }

  const target = typeof body.target === 'string' ? body.target.trim() : '';
  if (target.length === 0) return fail(400, 'A database id or path is required');
  if (!ID_PATTERN.test(target) && !target.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(target)) {
    return fail(400, 'Expected a 12-character registry id or an absolute path');
  }

  const keep = body.keep === undefined ? 5 : Number(body.keep);
  if (!Number.isFinite(keep) || keep < 1 || keep > 100) {
    return fail(400, '`keep` must be between 1 and 100');
  }

  const dir = typeof body.dir === 'string' && body.dir.trim() ? body.dir.trim() : undefined;

  try {
    const result = await snapshot(target, { keep: Math.trunc(keep), dir });
    return ok({ data: result });
  } catch (error) {
    if (error instanceof DbNotConfigured) {
      return fail(503, error.message);
    }
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}
