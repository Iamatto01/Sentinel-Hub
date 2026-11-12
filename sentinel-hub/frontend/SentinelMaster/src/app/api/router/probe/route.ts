import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { routerProbe } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

/**
 * Sends a real inference request through the gateway. This is the only honest
 * way to tell a working route from a broken one — the previous view displayed a
 * static "Online" pill that stayed green while every target returned 402/503.
 */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{ model?: unknown; models?: unknown; prompt?: unknown }>(request);
  const prompt = typeof body?.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;

  const requested = Array.isArray(body?.models)
    ? body.models.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    : typeof body?.model === 'string' && body.model.trim()
      ? [body.model.trim()]
      : [];

  if (requested.length === 0) return fail(400, 'Provide `model` or `models[]`');
  if (requested.length > 32) return fail(400, 'Probe at most 32 models per request');

  const results = await Promise.all(requested.map((model) => routerProbe(model, prompt)));
  return ok({ data: results, summary: { total: results.length, passed: results.filter((r) => r.ok).length } });
}
