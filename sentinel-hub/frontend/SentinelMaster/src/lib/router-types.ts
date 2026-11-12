/**
 * Sentinel Router gateway shapes and pure helpers.
 *
 * No `next/server`, no `env` — the server-side client (`src/lib/router.ts`) and
 * the browser-side view both import from here, so a client component never drags
 * Node-only modules into the bundle.
 */

export interface RouterConnection {
  id: string;
  provider: string;
  authType: string;
  name: string;
  email?: string | null;
  priority: number;
  isActive: boolean;
  testStatus: string;
  backoffLevel: number;
  lastTested?: string | null;
  defaultModel?: string | null;
  consecutiveUseCount?: number;
  maxConcurrent?: number | null;
}

export interface RouterComboStep {
  id?: string;
  kind?: string;
  model: string;
  providerId?: string | null;
  weight?: number;
}

export interface RouterCombo {
  id: string;
  name: string;
  strategy?: string | null;
  description?: string | null;
  models: RouterComboStep[];
  /** Providers referenced by this combo that have no connection on the gateway. */
  deadTargets?: string[];
}

export interface RouterMapping {
  id: string;
  pattern: string;
  comboId: string;
  comboName?: string | null;
  priority: number;
  enabled: boolean;
  description?: string | null;
  /** True when the glob is broad enough to swallow unrelated provider prefixes. */
  overbroad?: boolean;
  risk?: string | null;
}

export interface RouterModel {
  id: string;
  name?: string | null;
  fullModel?: string | null;
  provider?: string | null;
}

export interface RouterProviderStrategy {
  fallbackStrategy?: string;
  stickyRoundRobinLimit?: number;
}

export interface RouterRoutingPolicy {
  comboStrategy?: string;
  stickyRoundRobinLimit?: number;
  comboStickyRoundRobinLimit?: number | null;
  fallbackStrategy?: string;
  providerStrategies?: Record<string, RouterProviderStrategy>;
}

export interface RouterCounts {
  connections: number;
  activeConnections: number;
  combos: number;
  mappings: number;
  overbroadMappings: number;
  models: number;
  providerTypes: number;
}

export interface RouterSnapshot {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  publicUrl?: string | null;
  health?: string | null;
  instanceName?: string | null;
  error?: string;
  counts: RouterCounts;
  connections: RouterConnection[];
  combos: RouterCombo[];
  mappings: RouterMapping[];
  models: RouterModel[];
  routing: RouterRoutingPolicy;
}

export interface RouterProbeResult {
  model: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  content?: string;
  error?: string;
}

/**
 * Connection credentials for the coding tools. `apiKey` is a preview plus a
 * `configured` flag — the full secret never leaves the server, so the client
 * bundle cannot leak it the way it did when the key and the admin password were
 * literals in `OverviewView.tsx`.
 */
export interface RouterCredentials {
  baseUrl: string;
  localUrl: string;
  anthropicUrl: string;
  apiKey: { configured: boolean; preview: string | null };
  managementPasswordConfigured: boolean;
  reachable: boolean;
  health: string | null;
  models: string[];
}

export interface RouterWriteResult {
  action: string;
  /** The upstream resource's id when the call created or addressed one. */
  id: string | null;
  target: string;
  upstream: unknown;
}

export const ROUTING_STRATEGIES = ['priority', 'round-robin', 'random', 'least-used', 'weighted'] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];

/**
 * A glob that begins and ends with `*` matches every model id containing the
 * literal fragment anywhere — including the `cfp/`, `oc/` and `ds-web/` provider
 * prefixes. Those patterns silently reroute unrelated requests into a combo,
 * which is precisely how every free-tier call previously returned 402/503.
 */
export function assessGlobRisk(pattern: string): { overbroad: boolean; risk: string | null } {
  const trimmed = pattern.trim();
  const startsAndEnds = trimmed.startsWith('*') && trimmed.endsWith('*');
  const literal = trimmed.replace(/[*?]/g, '');
  const hasSlash = literal.includes('/');

  if (trimmed.length === 0 || literal.length === 0) {
    return { overbroad: true, risk: 'Matches every model id — all inference is forced through this combo.' };
  }
  if (startsAndEnds && !hasSlash) {
    return {
      overbroad: true,
      risk: `Matches every model id containing "${literal}" anywhere — including cfp/, oc/ and ds-web/ ids, which get rerouted into this combo and never reach their own provider.`,
    };
  }
  if (trimmed.includes('*') && !hasSlash) {
    return {
      overbroad: true,
      risk: `Wildcard with no provider prefix — can capture unrelated provider namespaces containing "${literal}".`,
    };
  }
  return { overbroad: false, risk: null };
}
