import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { describeKaliError, runServerCommand } from '@/lib/kali';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Executes an administrative command on the Kali server via the bridge. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{ command?: unknown }>(request);
  const command = typeof body?.command === 'string' ? body.command.trim() : '';
  if (!command) return fail(400, 'Command cannot be empty');

  try {
    const result = await runServerCommand(command);
    return ok({ data: result });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}
