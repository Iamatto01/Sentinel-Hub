import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { routerDeleteMapping } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removes one model→combo mapping. Overbroad globs are the primary suspect here. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id } = await context.params;
  try {
    return ok({ data: await routerDeleteMapping(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mapping deletion failed';
    return fail(400, message, (error as { upstreamBody?: string }).upstreamBody);
  }
}
