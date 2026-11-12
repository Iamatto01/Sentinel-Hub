import type { NextRequest } from 'next/server';
import { guard, parseId } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { FameNotConfigured, describeFameError, rejectPayment } from '@/lib/fame';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return fail(400, 'Invalid payment id');

  try {
    return ok({ data: await rejectPayment(id) });
  } catch (error) {
    if (error instanceof FameNotConfigured) return fail(503, 'FAME_ADMIN_KEY is not configured');
    const described = describeFameError(error);
    return fail(described.status, described.message);
  }
}
