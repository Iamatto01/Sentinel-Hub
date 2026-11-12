import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, toErrorResponse } from '@/lib/http';
import { getAutobotSnapshot } from '@/lib/fame';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live view of the standalone Sentinel Autobot service. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  if (!env.autobot.baseUrl) {
    return fail(503, 'AUTOBOT_BASE_URL is not configured', 'Set AUTOBOT_BASE_URL to the bot API root');
  }

  try {
    return ok({ data: await getAutobotSnapshot() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
