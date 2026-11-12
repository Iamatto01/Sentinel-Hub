import { env } from './env';
import { fetchJson, fetchResponse, UpstreamError } from './http';
import {
  assessGlobRisk,
  type RouterCombo,
  type RouterComboStep,
  type RouterConnection,
  type RouterMapping,
  type RouterModel,
  type RouterProbeResult,
  type RouterRoutingPolicy,
  type RouterSnapshot,
  type RouterWriteResult,
} from './router-types';

/**
 * Sentinel Router gateway client.
 *
 * The gateway exposes two independent auth planes:
 *   - `/api/*`  management plane, authenticated by an `auth_token` cookie from
 *               `POST /api/auth/login`.
 *   - `/v1/*`   inference plane, authenticated by `Authorization: Bearer sk-...`.
 *
 * Management cookies are short-lived, so every call goes through `manage()`,
 * which logs in on demand and retries exactly once on a 401.
 */

export * from './router-types';

function managementPassword(): string | undefined {
  return env.router.managementPassword;
}

export function routerConfigured(): boolean {
  return Boolean(managementPassword());
}

class RouterSession {
  private cookie: string | null = null;
  private cookieAt = 0;

  async login(): Promise<void> {
    const password = managementPassword();
    if (!password) {
      throw new UpstreamError('Router management password is not configured (HUB_ROUTER_PASSWORD).', 500);
    }

    const response = await fetchResponse(`${env.router.baseUrl}/api/auth/login`, {
      method: 'POST',
      body: { password },
      timeoutMs: env.router.timeoutMs,
    });

    if (response.status !== 200) {
      throw new UpstreamError(
        `Router login rejected (HTTP ${response.status}). Check HUB_ROUTER_PASSWORD against the gateway INITIAL_PASSWORD.`,
        response.status,
        response.text.slice(0, 300),
      );
    }

    const setCookie = response.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/auth_token=([^;]+)/);
    if (!match) {
      throw new UpstreamError('Router login did not return an auth_token cookie.', 502, setCookie.slice(0, 300));
    }
    this.cookie = `auth_token=${match[1]}`;
    this.cookieAt = Date.now();
  }

  /** Management sessions are short-lived; treat a cookie older than 20 minutes as dead. */
  private fresh(): boolean {
    return Boolean(this.cookie) && Date.now() - this.cookieAt < 20 * 60 * 1000;
  }

  async manage<T>(
    path: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
  ): Promise<T> {
    if (!this.fresh()) await this.login();

    const call = async (): Promise<T> =>
      fetchJson<T>(`${env.router.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: { Cookie: this.cookie ?? '' },
        body: options.body,
        timeoutMs: env.router.timeoutMs,
      });

    try {
      return await call();
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : 0;
      if (status !== 401 && status !== 403) throw error;
      this.cookie = null;
      await this.login();
      return call();
    }
  }
}

let session: RouterSession | null = null;

function routerSession(): RouterSession {
  if (!session) session = new RouterSession();
  return session;
}

/** Drops the cached management cookie so the next call re-authenticates. */
export function resetRouterSession(): void {
  session = null;
}

/**
 * Full read-only picture of the gateway: connections, combos, glob mappings and
 * the live routing policy. Any single failing endpoint degrades that section to
 * empty rather than failing the whole snapshot — the view must still render when
 * one management endpoint is misbehaving.
 */
export async function routerSnapshot(): Promise<RouterSnapshot> {
  const base: RouterSnapshot = {
    configured: routerConfigured(),
    reachable: false,
    baseUrl: env.router.baseUrl,
    publicUrl: env.router.publicUrl ?? null,
    counts: {
      connections: 0,
      activeConnections: 0,
      combos: 0,
      mappings: 0,
      overbroadMappings: 0,
      models: 0,
      providerTypes: 0,
    },
    connections: [],
    combos: [],
    mappings: [],
    models: [],
    routing: {},
  };

  if (!base.configured) {
    base.error = 'HUB_ROUTER_PASSWORD is not set — the Hub cannot read the gateway.';
    return base;
  }

  const client = routerSession();
  const soft = async <T>(path: string): Promise<T | null> => {
    try {
      return await client.manage<T>(path);
    } catch {
      return null;
    }
  };

  const [providers, combos, mappings, settings, models, builder, health] = await Promise.all([
    soft<{ connections?: RouterConnection[] }>('/api/providers'),
    soft<{ combos?: RouterCombo[] }>('/api/combos'),
    soft<{ mappings?: RouterMapping[] }>('/api/model-combo-mappings'),
    soft<Record<string, unknown>>('/api/settings'),
    soft<{ data?: RouterModel[]; models?: RouterModel[] }>('/api/models'),
    soft<{ providers?: unknown[] }>('/api/combos/builder/options'),
    soft<Record<string, unknown>>('/api/health'),
  ]);

  base.connections = providers?.connections ?? [];
  base.reachable = Boolean(providers) || Boolean(combos) || Boolean(settings) || Boolean(health);
  if (health && typeof health.status === 'string') base.health = health.status;
  else if (base.reachable) base.health = 'ok';

  const declaredProviders = new Set(base.connections.map((connection) => connection.provider));
  base.combos = (combos?.combos ?? []).map((combo) => {
    const deadTargets = (combo.models ?? [])
      .map((step) => step.providerId ?? null)
      .filter((providerId): providerId is string => providerId !== null && !declaredProviders.has(providerId));
    return { ...combo, deadTargets: Array.from(new Set(deadTargets)) };
  });

  base.mappings = ((mappings?.mappings ?? []) as RouterMapping[]).map((mapping) => {
    const risk = assessGlobRisk(mapping.pattern);
    return { ...mapping, overbroad: risk.overbroad, risk: risk.risk };
  });

  if (settings) {
    const strategies = settings.providerStrategies;
    base.routing = {
      comboStrategy: typeof settings.comboStrategy === 'string' ? settings.comboStrategy : undefined,
      stickyRoundRobinLimit:
        typeof settings.stickyRoundRobinLimit === 'number' ? settings.stickyRoundRobinLimit : undefined,
      comboStickyRoundRobinLimit:
        typeof settings.comboStickyRoundRobinLimit === 'number' ? settings.comboStickyRoundRobinLimit : null,
      fallbackStrategy: typeof settings.fallbackStrategy === 'string' ? settings.fallbackStrategy : undefined,
      providerStrategies:
        strategies && typeof strategies === 'object'
          ? (strategies as RouterRoutingPolicy['providerStrategies'])
          : {},
    };
    base.instanceName = typeof settings.instanceName === 'string' ? settings.instanceName : null;
  }

  base.models = (models?.data ?? models?.models ?? [])
    .map((raw: any) => {
      let rawId = String(raw?.fullModel || raw?.id || raw?.model || raw?.name || '').trim();
      if (rawId.startsWith('kr/')) rawId = rawId.replace(/^kr\//, 'kiro/');
      else if (rawId.startsWith('gc/')) rawId = rawId.replace(/^gc\//, 'grok-cli/');
      const id = rawId;
      return {
        id,
        name: raw?.name ? String(raw.name) : null,
        fullModel: raw?.fullModel ? String(raw.fullModel) : null,
        provider: raw?.provider ? String(raw.provider) : null,
      };
    })
    .filter((model: RouterModel) => {
      if (!model.id) return false;
      const idLower = model.id.toLowerCase();
      if (idLower.includes('gpt-5.6-')) return false;
      if (idLower.startsWith('antigravity/claude-') || idLower.startsWith('antigravity/gpt-oss-')) return false;
      if (idLower.startsWith('aihorde/') || idLower.startsWith('horde2/')) return false;
      return true;
    });

  base.counts = {
    connections: base.connections.length,
    activeConnections: base.connections.filter((connection) => connection.isActive).length,
    combos: base.combos.length,
    mappings: base.mappings.length,
    overbroadMappings: base.mappings.filter((mapping) => mapping.overbroad).length,
    models: base.models.length,
    providerTypes: builder?.providers?.length ?? 0,
  };

  return base;
}

function upstreamMessage(error: unknown): string {
  const detail = (error as { upstreamBody?: string }).upstreamBody;
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string; code?: string } };
      if (parsed.error?.message) {
        const status = error instanceof UpstreamError ? error.status : 0;
        return `${parsed.error.code ?? status}: ${parsed.error.message}`;
      }
    } catch {
      // Body was not JSON — fall through to the generic message.
    }
    return `${error instanceof Error ? error.message : 'Request failed'}: ${detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends a real inference request through the gateway so the Hub can prove a route
 * works instead of displaying a static "Online" badge.
 *
 * Only ever sends a `user` turn, which every provider transport accepts. For any
 * turn that must carry the operator persona use `routerOperatorChat` instead — a
 * `system` role is silently discarded by the `cfp/*` transport.
 */
export async function routerProbe(model: string, prompt = 'Reply with exactly: PONG'): Promise<RouterProbeResult> {
  const key = env.router.apiKey;
  const started = Date.now();

  if (!key) {
    return {
      model,
      ok: false,
      status: 0,
      latencyMs: 0,
      error: 'HUB_ROUTER_KEY is not set — the Hub cannot send inference requests.',
    };
  }
  if (!model.trim()) {
    return { model, ok: false, status: 0, latencyMs: 0, error: 'Model id is required.' };
  }

  try {
    const body = await fetchJson<{ choices?: { message?: { content?: string } }[] }>(
      `${env.router.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: {
          model: model.trim(),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 16,
          stream: false,
        },
        // Browser-backed providers (cfp) take tens of seconds to cold-start.
        timeoutMs: Math.max(env.router.timeoutMs, 180_000),
      },
    );

    return {
      model,
      ok: true,
      status: 200,
      latencyMs: Date.now() - started,
      content: body.choices?.[0]?.message?.content ?? '',
    };
  } catch (error) {
    const status = error instanceof UpstreamError ? error.status : 0;
    return {
      model,
      ok: false,
      status,
      latencyMs: Date.now() - started,
      error: upstreamMessage(error).slice(0, 400),
    };
  }
}

/**
 * Providers whose transport has no field for a client `system` prompt.
 *
 * `open-sse/executors/cloudflare-playground.ts` drops every non-user/assistant
 * message (`toCfMessages`, line 194) because the reverse-engineered
 * `cf_agent_use_chat_request` protocol carries no system slot — the playground's
 * persona is server-side. A `system` message sent to these providers is silently
 * discarded, so the model would answer as a generic assistant. Measured: the
 * operator contract scored 0/4 compliance via the `system` role and 4/4 folded
 * into the user turn.
 */
const SYSTEM_DROPPING_PROVIDERS = new Set(['cloudflare-playground']);

function providerOf(model: string): string | undefined {
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : undefined;
}

/**
 * Builds the message array for an operator request.
 *
 * The persona MUST travel as the `system` role when the provider supports it, and
 * MUST be folded into the user turn when it does not. Folding unconditionally
 * would work everywhere but loses the role separation local models honour, so the
 * decision is per-provider and testable.
 */
export function buildOperatorMessages(
  model: string,
  persona: string | undefined,
  prompt: string,
): { role: 'system' | 'user'; content: string }[] {
  const clean = (persona ?? '').trim();
  if (!clean) return [{ role: 'user', content: prompt }];

  const provider = providerOf(model);
  if (provider && SYSTEM_DROPPING_PROVIDERS.has(provider)) {
    return [{ role: 'user', content: `${clean}\n\n---\n\n${prompt}` }];
  }
  return [
    { role: 'system', content: clean },
    { role: 'user', content: prompt },
  ];
}

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Runs one operator turn through the gateway with the persona correctly delivered.
 *
 * Wraps `buildOperatorMessages` so no caller can reintroduce the silent-drop bug.
 * Combo calls must pass the persona explicitly — the gateway's own
 * `combos.system_message` never reaches `cfp/*` legs, so relying on it produces an
 * unpersonaed answer from every cloud model in the cascade.
 */
export async function routerOperatorChat(input: {
  model: string;
  prompt: string;
  persona?: string;
  maxTokens?: number;
}): Promise<RouterProbeResult> {
  const key = env.router.apiKey;
  const started = Date.now();
  const model = input.model.trim();

  if (!key) {
    return { model, ok: false, status: 0, latencyMs: 0, error: 'HUB_ROUTER_KEY is not set.' };
  }
  if (!model) {
    return { model, ok: false, status: 0, latencyMs: 0, error: 'Model id is required.' };
  }

  try {
    const body = await fetchJson<{ choices?: { message?: { content?: string } }[] }>(
      `${env.router.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key },
        body: {
          model,
          messages: buildOperatorMessages(model, input.persona, input.prompt),
          max_tokens: input.maxTokens ?? 2048,
          stream: false,
        },
        // Cloud legs retry internally; a blocked roll costs ~10s before failover.
        timeoutMs: Math.max(env.router.timeoutMs, 240_000),
      },
    );

    return {
      model,
      ok: true,
      status: 200,
      latencyMs: Date.now() - started,
      content: body.choices?.[0]?.message?.content ?? '',
    };
  } catch (error) {
    const status = error instanceof UpstreamError ? error.status : 0;
    return {
      model,
      ok: false,
      status,
      latencyMs: Date.now() - started,
      error: upstreamMessage(error).slice(0, 400),
    };
  }
}

/**
 * Creates a model→combo mapping. Overbroad globs are rejected outright: they are
 * how every `cfp/*`, `oc/*` and `ds-web/*` request previously got swallowed into
 * a combo and returned 402/503 instead of reaching its own provider.
 */
export async function routerCreateMapping(input: {
  pattern: string;
  comboId: string;
  priority?: number;
  enabled?: boolean;
  description?: string;
}): Promise<RouterWriteResult> {
  const pattern = input.pattern.trim();
  if (pattern.length < 1 || pattern.length > 500) {
    throw new UpstreamError('pattern must be 1-500 characters', 400);
  }
  const risk = assessGlobRisk(pattern);
  if (risk.overbroad) throw new UpstreamError(risk.risk ?? 'Pattern is too broad to be safe', 400);

  const comboId = input.comboId.trim();
  if (!ID_PATTERN.test(comboId)) throw new UpstreamError('comboId is invalid', 400);

  const upstream = await routerSession().manage<{ mapping?: { id?: string } }>('/api/model-combo-mappings', {
    method: 'POST',
    body: {
      pattern,
      comboId,
      priority: typeof input.priority === 'number' ? input.priority : 0,
      enabled: input.enabled !== false,
      description: input.description ?? '',
    },
  });
  return { action: 'create-mapping', id: upstream?.mapping?.id ?? null, target: pattern, upstream };
}

export async function routerDeleteMapping(id: string): Promise<RouterWriteResult> {
  if (!ID_PATTERN.test(id)) throw new UpstreamError('Mapping id is invalid', 400);
  const upstream = await routerSession().manage(`/api/model-combo-mappings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return { action: 'delete-mapping', id, target: id, upstream };
}

/**
 * Repoints one combo's steps. The Hub always forces `round-robin` so a single
 * dead upstream cannot fail the whole combo — the original failure mode, where a
 * priority-ordered combo returned the first target's error to the caller.
 */
export async function routerUpdateComboModels(id: string, models: RouterComboStep[]): Promise<RouterWriteResult> {
  if (!ID_PATTERN.test(id)) throw new UpstreamError('Combo id is invalid', 400);
  if (!Array.isArray(models) || models.length === 0) {
    throw new UpstreamError('At least one combo step is required', 400);
  }

  const steps = models.map((step) => {
    const model = String(step.model ?? '').trim();
    if (!model || model.length > 300) {
      throw new UpstreamError('Every combo step needs a model id (1-300 chars)', 400);
    }
    return {
      kind: 'model' as const,
      model,
      ...(step.providerId ? { providerId: step.providerId } : {}),
      ...(step.id ? { id: step.id } : {}),
      weight: typeof step.weight === 'number' ? step.weight : 100,
    };
  });

  const client = routerSession();
  const current = await client.manage<RouterCombo>(`/api/combos/${encodeURIComponent(id)}`);
  const upstream = await client.manage(`/api/combos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: {
      name: current.name,
      description: current.description ?? '',
      models: steps,
      strategy: 'round-robin',
    },
  });
  return { action: 'update-combo', id, target: id, upstream };
}

/** Patches the routing policy. Round-robin across connections keeps free tiers alive. */
export async function routerUpdateRouting(policy: RouterRoutingPolicy): Promise<RouterWriteResult> {
  const client = routerSession();
  const settings = await client.manage<{ settingsRevision?: number }>('/api/settings');
  const revision = typeof settings.settingsRevision === 'number' ? settings.settingsRevision : undefined;

  const upstream = await client.manage('/api/settings', {
    method: 'PATCH',
    body: { ...(revision !== undefined ? { expectedRevision: revision } : {}), ...policy },
  });
  return { action: 'update-routing', id: null, target: 'settings', upstream };
}
