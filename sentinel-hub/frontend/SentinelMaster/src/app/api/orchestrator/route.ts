import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, fail, toErrorResponse } from '@/lib/http';
import { orchestratorEngine } from '@/lib/orchestrator/engine';
import { hindsight } from '@/lib/orchestrator/memory';
import { routerSnapshot } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const memoryCount = await hindsight.count();
    const isBusy = orchestratorEngine.isBusy();
    const lastResult = orchestratorEngine.getLastResult();
    const snapshot = await routerSnapshot();

    return ok({
      data: {
        isBusy,
        memoryCount,
        lastResult,
        availableModels: snapshot.models.map((m) => m.id),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = (await request.json()) as {
      goal?: string;
      supervisorModel?: string;
      subagentModel?: string;
      concurrencyLimit?: number;
      useBrowser?: boolean;
    };

    if (!body.goal || !body.goal.trim()) {
      return fail(400, 'Goal is required to run orchestration.');
    }

    if (orchestratorEngine.isBusy()) {
      return fail(409, 'An orchestration run is already in progress.');
    }

    const result = await orchestratorEngine.run({
      goal: body.goal.trim(),
      supervisorModel: body.supervisorModel || 'sentinel-flagship',
      subagentModel: body.subagentModel || 'sentinel-flagship',
      concurrencyLimit: body.concurrencyLimit ?? 4,
      useBrowser: Boolean(body.useBrowser),
    });

    return ok({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
