import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, toErrorResponse } from '@/lib/http';
import { buildOverview } from '@/lib/overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    return ok({ data: await buildOverview() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
