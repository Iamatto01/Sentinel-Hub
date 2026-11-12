import type { NextRequest } from 'next/server';
import { guard, parseId } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { FameNotConfigured, approvePayment, describeFameError, getFameSnapshot } from '@/lib/fame';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Credits a pending payment. `completePayment()` on the Worker is atomic and
 * idempotent, so a double submit cannot credit the same payment twice.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return fail(400, 'Invalid payment id');

  try {
    const payment = await approvePayment(id);
    const snapshot = await getFameSnapshot({ paymentLimit: 200 }).catch(() => null);
    return ok({ data: { payment, stats: snapshot?.stats ?? null } });
  } catch (error) {
    if (error instanceof FameNotConfigured) return fail(503, 'FAME_ADMIN_KEY is not configured');
    const described = describeFameError(error);
    return fail(described.status, described.message);
  }
}
