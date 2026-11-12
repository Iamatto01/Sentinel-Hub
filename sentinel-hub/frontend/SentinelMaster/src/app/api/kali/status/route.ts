import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
import { KaliNotConfigured, describeKaliError, getStatus, kaliConfigured } from '@/lib/kali';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PM2 process table, host resources and open ports from the Kali bridge. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const gate = kaliConfigured();
  if (!gate.ok) {
    return ok({ data: { configured: false, reason: gate.reason, reachable: false, pm2: [], pm2Summary: null } });
  }

  try {
    return ok({ data: await getStatus() });
  } catch (error) {
    if (error instanceof KaliNotConfigured) {
      return ok({ data: { configured: false, reason: error.message, reachable: false, pm2: [], pm2Summary: null } });
    }
    const described = describeKaliError(error);
    return ok({
      data: { configured: true, reachable: false, reason: described.message, pm2: [], pm2Summary: null },
    });
  }
}
