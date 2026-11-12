import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { routerUpdateComboModels, type RouterComboStep } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Repoints a combo's steps. The Hub always forces `round-robin` so one dead
 * upstream cannot fail the whole combo — the original failure mode where a
 * priority-ordered combo returned the first target's error to the caller.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { id } = await context.params;
  const body = await readJson<{ models?: unknown }>(request);
  if (!Array.isArray(body?.models)) return fail(400, 'models[] is required');

  const steps: RouterComboStep[] = body.models.map((raw) => {
    const step = raw as RouterComboStep;
    return {
      id: typeof step?.id === 'string' ? step.id : undefined,
      kind: 'model',
      model: String(step?.model ?? '').trim(),
      providerId: typeof step?.providerId === 'string' ? step.providerId : null,
      weight: typeof step?.weight === 'number' ? step.weight : 100,
    };
  });

  try {
    return ok({ data: await routerUpdateComboModels(id, steps) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Combo update failed';
    return fail(400, message, (error as { upstreamBody?: string }).upstreamBody);
  }
}
