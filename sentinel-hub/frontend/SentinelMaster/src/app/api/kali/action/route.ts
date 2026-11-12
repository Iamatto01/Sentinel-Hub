import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { describeKaliError, doAction, type KaliAction } from '@/lib/kali';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ACTIONS: KaliAction[] = ['restart', 'stop', 'reload', 'start'];

/** Restarts, stops or reloads one PM2 process on Kali, or every process. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{ action?: unknown; target?: unknown }>(request);
  const action = typeof body?.action === 'string' ? (body.action as KaliAction) : null;
  if (!action || !ACTIONS.includes(action)) return fail(400, `action must be one of: ${ACTIONS.join(', ')}`);

  const target = typeof body?.target === 'string' && body.target.trim() ? body.target.trim() : 'all';
  if (target !== 'all' && !/^[A-Za-z0-9_.-]{1,128}$/.test(target)) {
    return fail(400, 'Invalid PM2 target name');
  }

  try {
    return ok({ data: await doAction(action, target) });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}
