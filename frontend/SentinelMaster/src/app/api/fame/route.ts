import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
import { FameNotConfigured, getFameSnapshot } from '@/lib/fame';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The authoritative payment ledger.
 *
 * `getFameSnapshot()` calls the production Worker directly and normalises the
 * raw JSON array it returns, which is why the dashboard now updates as soon as
 * a payment lands instead of showing an empty queue.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = limitRaw && /^\d{1,3}$/.test(limitRaw) ? Number.parseInt(limitRaw, 10) : 200;

  try {
    return ok({ data: await getFameSnapshot({ paymentLimit: limit }) });
  } catch (error) {
    if (error instanceof FameNotConfigured) {
      return ok({
        data: {
          configured: false,
          reason: 'FAME_ADMIN_KEY is not configured',
          payments: [],
          pending: [],
          recentCompleted: [],
          syncedAt: new Date().toISOString(),
        },
      });
    }
    throw error;
  }
}
