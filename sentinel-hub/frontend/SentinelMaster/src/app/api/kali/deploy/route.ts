import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { describeKaliError, deploy, kaliConfigured } from '@/lib/kali';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Archive, SFTP, npm install, next build and PM2 restart need real headroom. */
export const maxDuration = 900;

/**
 * Runs `deploy-kali.py` end to end and returns the full transcript.
 *
 * Guarded by an explicit confirmation token in the body so a stray request from
 * an open tab cannot trigger a production deployment.
 */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = kaliConfigured();
  if (!gate.ok) return fail(503, 'Kali is not configured', gate.reason);

  const body = await readJson<{ confirm?: unknown }>(request);
  if (body?.confirm !== 'deploy') {
    return fail(400, 'Confirmation required', 'Send {"confirm":"deploy"} to start a deployment');
  }

  try {
    const result = await deploy();
    return ok({ data: result }, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}
