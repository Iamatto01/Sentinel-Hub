import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
import { DbNotConfigured, dbConfigured, discover } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY = {
  configured: false,
  reachable: false,
  total: 0,
  managedCount: 0,
  noiseCount: 0,
  divergedCount: 0,
  managed: [],
  noise: [],
  duplicateGroups: [],
  roots: [],
  scannedAt: new Date().toISOString(),
};

/**
 * Read-only database inventory for every project on the host.
 *
 * Degrades to `configured: false` instead of a 5xx so the Databases page can
 * explain what is missing rather than rendering an error box.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = dbConfigured();
  if (!gate.ok) return ok({ data: { ...EMPTY, reason: gate.reason } });

  try {
    return ok({ data: { configured: true, reachable: true, ...(await discover()) } });
  } catch (error) {
    if (error instanceof DbNotConfigured) {
      return ok({ data: { ...EMPTY, reason: error.message } });
    }
    const message = error instanceof Error ? error.message : 'The database bridge failed';
    return ok({ data: { ...EMPTY, configured: true, reason: message } });
  }
}
