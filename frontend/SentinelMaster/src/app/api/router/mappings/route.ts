import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { assessGlobRisk, routerCreateMapping, routerSnapshot } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lists every model→combo mapping with a risk verdict, and creates new ones.
 *
 * Creation refuses overbroad globs such as `*glm*`: those matched every model id
 * containing the fragment, including `cfp/zai-org/glm-5.2`, and silently rerouted
 * unrelated requests into a combo.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const snapshot = await routerSnapshot();
  return ok({ data: snapshot.mappings, counts: snapshot.counts, reachable: snapshot.reachable });
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{
    pattern?: unknown;
    comboId?: unknown;
    priority?: unknown;
    enabled?: unknown;
    description?: unknown;
  }>(request);

  const pattern = typeof body?.pattern === 'string' ? body.pattern.trim() : '';
  const comboId = typeof body?.comboId === 'string' ? body.comboId.trim() : '';
  if (!pattern) return fail(400, 'pattern is required');
  if (!comboId) return fail(400, 'comboId is required');

  const risk = assessGlobRisk(pattern);
  if (risk.overbroad) return fail(400, 'Refused: pattern is too broad', risk.risk ?? undefined);

  try {
    const result = await routerCreateMapping({
      pattern,
      comboId,
      priority: typeof body?.priority === 'number' ? body.priority : 0,
      enabled: body?.enabled !== false,
      description: typeof body?.description === 'string' ? body.description : '',
    });
    return ok({ data: result, id: result.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mapping creation failed';
    return fail(400, message, (error as { upstreamBody?: string }).upstreamBody);
  }
}
