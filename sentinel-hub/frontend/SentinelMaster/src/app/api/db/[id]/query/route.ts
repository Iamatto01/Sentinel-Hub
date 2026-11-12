import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { describeDbError, queryTable } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[0-9a-f]{12}$/;
const MAX_LIMIT = 200;

/**
 * Paged, masked preview of one table.
 *
 * Values in sensitive columns (`password`, `token`, `secret`, …) are replaced
 * with `<masked>` by the bridge on the host, so they never cross the network
 * even though this route is authenticated.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id: raw } = await context.params;
  const id = decodeURIComponent(raw ?? '').trim();
  if (id.length === 0) return fail(400, 'A database id or path is required');
  if (!ID_PATTERN.test(id) && !id.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(id)) {
    return fail(400, 'Expected a 12-character registry id or an absolute path');
  }

  const params = request.nextUrl.searchParams;
  const table = (params.get('table') ?? '').trim();
  if (table.length === 0) return fail(400, 'A table name is required');
  if (table.length > 128) return fail(400, 'Table name is too long');

  const limit = clampInt(params.get('limit'), 50, 1, MAX_LIMIT);
  const offset = clampInt(params.get('offset'), 0, 0, 10_000_000);
  const search = (params.get('search') ?? '').slice(0, 200);

  try {
    return ok({ data: await queryTable(id, table, { limit, offset, search }) });
  } catch (error) {
    const described = describeDbError(error);
    return fail(described.status, described.message);
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
