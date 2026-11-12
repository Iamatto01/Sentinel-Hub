import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson, toErrorResponse } from '@/lib/http';
import { autobotCreateBattle, getAutobotSnapshot } from '@/lib/fame';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  if (!env.autobot.baseUrl) return fail(503, 'AUTOBOT_BASE_URL is not configured');

  try {
    return ok({ data: await getAutobotSnapshot() });
  } catch (error) {
    return toErrorResponse(error, 502);
  }
}

/** Creates a battle pairing between two singers for an event. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  if (!env.autobot.baseUrl) return fail(503, 'AUTOBOT_BASE_URL is not configured');

  const body = await readJson<{ eventId?: unknown; singerA?: unknown; singerB?: unknown }>(request);
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  const singerA = Number(body?.singerA);
  const singerB = Number(body?.singerB);

  if (!/^[A-Za-z0-9._:-]{1,60}$/.test(eventId)) return fail(400, 'A valid eventId is required');
  if (!Number.isInteger(singerA) || singerA <= 0) return fail(400, 'singerA must be a positive integer');
  if (!Number.isInteger(singerB) || singerB <= 0) return fail(400, 'singerB must be a positive integer');
  if (singerA === singerB) return fail(400, 'A battle needs two different singers');

  try {
    return ok({ data: await autobotCreateBattle({ eventId, singerA, singerB }) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 502);
  }
}
