import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { routerUpdateRouting, type RouterRoutingPolicy } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRATEGIES = new Set(['priority', 'round-robin', 'random', 'least-used', 'weighted']);

/**
 * Updates the gateway's routing policy.
 *
 * Only whitelisted keys are forwarded. A free-form passthrough here would let a
 * stray UI field overwrite unrelated gateway settings, which is exactly the kind
 * of unattributed config drift this Hub exists to prevent.
 */
export async function PATCH(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return fail(400, 'A JSON body is required');

  const policy: RouterRoutingPolicy = {};

  if (body.comboStrategy !== undefined) {
    if (typeof body.comboStrategy !== 'string' || !STRATEGIES.has(body.comboStrategy)) {
      return fail(400, `comboStrategy must be one of: ${[...STRATEGIES].join(', ')}`);
    }
    policy.comboStrategy = body.comboStrategy;
  }

  if (body.fallbackStrategy !== undefined) {
    if (typeof body.fallbackStrategy !== 'string' || !STRATEGIES.has(body.fallbackStrategy)) {
      return fail(400, `fallbackStrategy must be one of: ${[...STRATEGIES].join(', ')}`);
    }
    policy.fallbackStrategy = body.fallbackStrategy;
  }

  for (const key of ['stickyRoundRobinLimit', 'comboStickyRoundRobinLimit'] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
      return fail(400, `${key} must be an integer between 1 and 100`);
    }
    if (key === 'stickyRoundRobinLimit') policy.stickyRoundRobinLimit = value;
    else policy.comboStickyRoundRobinLimit = value;
  }

  if (body.providerStrategies !== undefined) {
    const raw = body.providerStrategies;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return fail(400, 'providerStrategies must be an object keyed by provider id');
    }
    const strategies: NonNullable<RouterRoutingPolicy['providerStrategies']> = {};
    for (const [providerId, config] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(providerId)) return fail(400, `Invalid provider id: ${providerId}`);
      if (typeof config !== 'object' || config === null) return fail(400, `Invalid config for provider ${providerId}`);
      const entry = config as { fallbackStrategy?: unknown; stickyRoundRobinLimit?: unknown };
      const next: { fallbackStrategy?: string; stickyRoundRobinLimit?: number } = {};
      if (entry.fallbackStrategy !== undefined) {
        if (typeof entry.fallbackStrategy !== 'string' || !STRATEGIES.has(entry.fallbackStrategy)) {
          return fail(400, `Invalid fallbackStrategy for provider ${providerId}`);
        }
        next.fallbackStrategy = entry.fallbackStrategy;
      }
      if (entry.stickyRoundRobinLimit !== undefined) {
        const limit = entry.stickyRoundRobinLimit;
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
          return fail(400, `Invalid stickyRoundRobinLimit for provider ${providerId}`);
        }
        next.stickyRoundRobinLimit = limit;
      }
      strategies[providerId] = next;
    }
    policy.providerStrategies = strategies;
  }

  if (Object.keys(policy).length === 0) return fail(400, 'No supported routing keys supplied');

  try {
    return ok({ data: await routerUpdateRouting(policy) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Routing update failed';
    return fail(400, message, (error as { upstreamBody?: string }).upstreamBody);
  }
}
