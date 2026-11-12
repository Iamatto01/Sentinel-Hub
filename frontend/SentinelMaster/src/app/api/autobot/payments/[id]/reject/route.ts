import type { NextRequest } from 'next/server';
import { guard, parseId } from '@/lib/guard';
import { fail, ok, toErrorResponse } from '@/lib/http';
import { autobotAction } from '@/lib/fame';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  if (!env.autobot.baseUrl) return fail(503, 'AUTOBOT_BASE_URL is not configured');

  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return fail(400, 'Invalid payment id');

  try {
    return ok({ data: await autobotAction('reject', id) });
  } catch (error) {
    return toErrorResponse(error, 502);
  }
}
