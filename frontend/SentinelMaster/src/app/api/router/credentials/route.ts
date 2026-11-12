import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok } from '@/lib/http';
import { env } from '@/lib/env';
import { routerSnapshot } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Connection credentials for the coding tools, resolved from the Hub's own
 * environment instead of being pasted into a component.
 *
 * `HUB_ROUTER_KEY` is returned as a truncated preview plus a `configured` flag —
 * never the full secret. The view renders a masked value and the operator copies
 * it from `.env`. This closes the previous leak where the live `sk-...` key and
 * the gateway's admin password were hardcoded in the client bundle.
 */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const snapshot = await routerSnapshot();
  const key = env.router.apiKey;

  const comboNames = snapshot.combos.map((combo) => combo.name);
  const providerModelIds = snapshot.models.map((m) => m.id).filter(Boolean);
  const allModels = Array.from(new Set([...comboNames, ...providerModelIds]));

  return ok({
    data: {
      baseUrl: env.router.publicUrl ?? env.router.baseUrl,
      localUrl: `${env.router.baseUrl}/v1`,
      anthropicUrl: `${(env.router.publicUrl ?? env.router.baseUrl).replace(/\/v1$/, '')}/anthropic`,
      apiKey: {
        configured: Boolean(key),
        // Enough to recognise the key you already pasted; not enough to use it.
        preview: key ? `${key.slice(0, 8)}…${key.slice(-4)}` : null,
      },
      managementPasswordConfigured: Boolean(env.router.managementPassword),
      reachable: snapshot.reachable,
      health: snapshot.health ?? null,
      models: allModels,
      comboModels: comboNames,
      providerModels: providerModelIds,
    },
  });
}
