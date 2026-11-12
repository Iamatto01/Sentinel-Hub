import { env } from './env';
import { fetchJson, UpstreamError } from './http';

/**
 * SentinelFame client.
 *
 * The production Worker's admin endpoints return RAW JSON, not a `{success,
 * data}` envelope: `/api/admin/payments` responds with a bare array. This module
 * is the single place that knows that, and normalises every response into one
 * shape so the UI never has to guess. Getting this wrong is what previously made
 * approved payments appear not to update.
 */

export type PaymentStatus = 'pending' | 'completed' | 'rejected';

export interface FamePayment {
  id: number;
  singerId: number;
  singerName: string | null;
  voterName: string;
  voterMessage: string;
  method: string;
  voteCount: number;
  amountCents: number;
  amount: number;
  currency: string;
  reference: string | null;
  hasReceipt: boolean;
  status: PaymentStatus | string;
  createdAt: string;
  ageMinutes: number | null;
}

export interface FameStats {
  totalPayments: number;
  pendingCount: number;
  completedCount: number;
  rejectedCount: number;
  pendingVotes: number;
  completedVotes: number;
  revenueCents: number;
  revenue: number;
  pendingValueCents: number;
  pendingValue: number;
  currency: string;
  byMethod: Array<{ method: string; count: number; amountCents: number }>;
  oldestPendingAt: string | null;
}

export interface FameTraffic {
  stats: unknown;
  overTime: unknown;
  countries: unknown;
  referrers: unknown;
  pages: unknown;
  todayUnique: number | null;
}

export class FameNotConfigured extends Error {
  constructor() {
    super('FAME_ADMIN_KEY is not configured');
    this.name = 'FameNotConfigured';
  }
}

function authHeaders(): Record<string, string> {
  if (!env.fame.adminKey) throw new FameNotConfigured();
  return { 'x-admin-key': env.fame.adminKey };
}

function fameUrl(path: string): string {
  return `${env.fame.baseUrl}${path}`;
}

function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['payments', 'data', 'results', 'items']) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
    for (const key of ['payments', 'data', 'results']) {
      const nested = record[key];
      if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).payments)) {
        return (nested as Record<string, unknown>).payments as T[];
      }
    }
  }
  return [];
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePayment(raw: Record<string, unknown>): FamePayment {
  const amountCents = num(raw.amount_cents ?? raw.amountCents);
  const createdAt = String(raw.created_at ?? raw.createdAt ?? '');
  const createdMs = createdAt ? Date.parse(createdAt.includes('T') ? createdAt : `${createdAt.replace(' ', 'T')}Z`) : NaN;
  return {
    id: num(raw.id),
    singerId: num(raw.singer_id ?? raw.singerId),
    singerName: (raw.singer_name ?? raw.singerName ?? null) as string | null,
    voterName: String(raw.voter_name ?? raw.voterName ?? 'Anonymous'),
    voterMessage: String(raw.voter_message ?? raw.voterMessage ?? ''),
    method: String(raw.method ?? 'unknown'),
    voteCount: num(raw.vote_count ?? raw.voteCount),
    amountCents,
    amount: Math.round(amountCents) / 100,
    currency: String(raw.currency ?? 'USD'),
    reference: raw.reference === null || raw.reference === undefined ? null : String(raw.reference),
    hasReceipt: Boolean(raw.receipt_image ?? raw.receiptImage),
    status: String(raw.status ?? 'pending'),
    createdAt,
    ageMinutes: Number.isFinite(createdMs) ? Math.max(0, Math.round((Date.now() - createdMs) / 60_000)) : null,
  };
}

async function fetchAllPayments(): Promise<FamePayment[]> {
  const payload = await fetchJson<unknown>(fameUrl('/api/admin/payments'), {
    headers: authHeaders(),
    timeoutMs: 20_000,
  });
  return asArray<Record<string, unknown>>(payload).map(normalizePayment);
}

async function fetchPendingPayments(): Promise<FamePayment[]> {
  const payload = await fetchJson<unknown>(fameUrl('/api/admin/payments?status=pending'), {
    headers: authHeaders(),
    timeoutMs: 20_000,
  });
  return asArray<Record<string, unknown>>(payload).map(normalizePayment);
}

function computeStats(payments: FamePayment[]): FameStats {
  let pendingCount = 0;
  let completedCount = 0;
  let rejectedCount = 0;
  let pendingVotes = 0;
  let completedVotes = 0;
  let revenueCents = 0;
  let pendingValueCents = 0;
  const methods = new Map<string, { count: number; amountCents: number }>();
  let oldestPendingAt: string | null = null;

  for (const payment of payments) {
    const bucket = methods.get(payment.method) ?? { count: 0, amountCents: 0 };
    bucket.count += 1;
    bucket.amountCents += payment.amountCents;
    methods.set(payment.method, bucket);

    if (payment.status === 'completed') {
      completedCount += 1;
      completedVotes += payment.voteCount;
      revenueCents += payment.amountCents;
    } else if (payment.status === 'rejected') {
      rejectedCount += 1;
    } else {
      pendingCount += 1;
      pendingVotes += payment.voteCount;
      pendingValueCents += payment.amountCents;
      if (payment.createdAt && (!oldestPendingAt || payment.createdAt < oldestPendingAt)) {
        oldestPendingAt = payment.createdAt;
      }
    }
  }

  return {
    totalPayments: payments.length,
    pendingCount,
    completedCount,
    rejectedCount,
    pendingVotes,
    completedVotes,
    revenueCents,
    revenue: Math.round(revenueCents) / 100,
    pendingValueCents,
    pendingValue: Math.round(pendingValueCents) / 100,
    currency: payments.find((p) => p.status === 'completed')?.currency ?? payments[0]?.currency ?? 'USD',
    byMethod: [...methods]
      .map(([method, value]) => ({ method, count: value.count, amountCents: value.amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
    oldestPendingAt,
  };
}

export interface FameSnapshot {
  payments: FamePayment[];
  pending: FamePayment[];
  recentCompleted: FamePayment[];
  stats: FameStats;
  syncedAt: string;
  upstream: string;
}

/**
 * Single call the dashboard and the overview both use. Fetches the full ledger
 * once and derives pending/completed from it, so the numbers on screen always
 * add up to the number of rows shown.
 */
export async function getFameSnapshot(options: { paymentLimit?: number } = {}): Promise<FameSnapshot> {
  const limit = Math.min(Math.max(1, options.paymentLimit ?? 200), 500);
  const payments = await fetchAllPayments();
  const stats = computeStats(payments);

  return {
    payments: payments.slice(0, limit),
    pending: payments.filter((p) => p.status === 'pending').slice(0, limit),
    recentCompleted: payments.filter((p) => p.status === 'completed').slice(0, limit),
    stats,
    syncedAt: new Date().toISOString(),
    upstream: env.fame.baseUrl,
  };
}

/** Lightweight pending-only view, used by the overview to render the queue. */
export async function getPendingQueue(): Promise<{ pending: FamePayment[]; stats: FameStats; syncedAt: string }> {
  const pending = await fetchPendingPayments();
  return { pending, stats: computeStats(pending), syncedAt: new Date().toISOString() };
}

export async function approvePayment(id: number): Promise<FamePayment> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid payment id');
  const payload = await fetchJson<Record<string, unknown>>(fameUrl(`/api/admin/payments/${id}/approve`), {
    method: 'POST',
    headers: authHeaders(),
    timeoutMs: 25_000,
  });
  return normalizePayment(payload);
}

export async function rejectPayment(id: number): Promise<{ id: number; rejected: true }> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid payment id');
  await fetchJson<unknown>(fameUrl(`/api/admin/payments/${id}/reject`), {
    method: 'POST',
    headers: authHeaders(),
    timeoutMs: 25_000,
  });
  return { id, rejected: true };
}

export async function getTraffic(): Promise<FameTraffic> {
  const payload = await fetchJson<Record<string, unknown>>(fameUrl('/api/admin/traffic'), {
    headers: authHeaders(),
    timeoutMs: 20_000,
  });
  const todayUnique = payload.today_unique ?? payload.todayUnique;
  return {
    stats: payload.stats ?? null,
    overTime: payload.overTime ?? payload.over_time ?? null,
    countries: payload.countries ?? null,
    referrers: payload.referrers ?? null,
    pages: payload.pages ?? null,
    todayUnique: todayUnique === undefined || todayUnique === null ? null : num(todayUnique),
  };
}

/** Public, unauthenticated site statistics — safe to surface without a key. */
export async function getPublicStats(): Promise<unknown> {
  return fetchJson<unknown>(fameUrl('/api/stats'), { timeoutMs: 15_000 });
}

/** Maps an upstream failure onto a short, actionable operator message. */
export function describeFameError(error: unknown): { status: number; message: string } {
  if (error instanceof FameNotConfigured) {
    return { status: 503, message: 'FAME_ADMIN_KEY is not configured on the Hub' };
  }
  if (error instanceof UpstreamError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        message: 'SentinelFame rejected the admin key — set FAME_ADMIN_KEY to the Worker ADMIN_PASSWORD value',
      };
    }
    if (error.status === 404) return { status: 404, message: 'SentinelFame endpoint or payment not found' };
    if (error.status >= 500) return { status: 502, message: `SentinelFame returned ${error.status}` };
    return { status: 502, message: `SentinelFame request failed: ${error.message}` };
  }
  return { status: 500, message: error instanceof Error ? error.message : 'SentinelFame request failed' };
}

export interface AutobotSnapshot {
  configured: boolean;
  reachable: boolean;
  stats: unknown;
  pending: FamePayment[];
  battles: unknown;
  error?: string;
}

function autobotHeaders(): Record<string, string> {
  return env.autobot.adminKey ? { 'x-admin-token': env.autobot.adminKey } : {};
}

/**
 * Reads the standalone bot API. The Autobot is expected to run on the Kali box
 * (or locally during development), so an unreachable host is reported as a
 * degraded state rather than an error.
 */
export async function getAutobotSnapshot(): Promise<AutobotSnapshot> {
  const base = env.autobot.baseUrl;
  if (!base) {
    return { configured: false, reachable: false, stats: null, pending: [], battles: null, error: 'AUTOBOT_BASE_URL is not configured' };
  }

  const [stats, pending, battles] = await Promise.allSettled([
    fetchJson<unknown>(`${base}/api/stats`, { headers: autobotHeaders(), timeoutMs: 8_000 }),
    fetchJson<unknown>(`${base}/api/pending`, { headers: autobotHeaders(), timeoutMs: 8_000 }),
    fetchJson<unknown>(`${base}/api/battles`, { headers: autobotHeaders(), timeoutMs: 8_000 }),
  ]);

  const failures = [stats, pending, battles].filter((r) => r.status === 'rejected');
  if (failures.length === 3) {
    const reason = (failures[0] as PromiseRejectedResult).reason;
    return {
      configured: true,
      reachable: false,
      stats: null,
      pending: [],
      battles: null,
      error: reason instanceof Error ? reason.message : 'Autobot API unreachable',
    };
  }

  return {
    configured: true,
    reachable: true,
    stats: stats.status === 'fulfilled' ? stats.value : null,
    pending: pending.status === 'fulfilled' ? asArray<Record<string, unknown>>(pending.value).map(normalizePayment) : [],
    battles: battles.status === 'fulfilled' ? battles.value : null,
    ...(failures.length > 0 ? { error: `${failures.length} Autobot endpoint(s) unavailable` } : {}),
  };
}

export async function autobotAction(
  action: 'approve' | 'reject',
  id: number,
): Promise<{ ok: true; result: unknown }> {
  const base = env.autobot.baseUrl;
  if (!base) throw new Error('AUTOBOT_BASE_URL is not configured');
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid payment id');

  const result = await fetchJson<unknown>(`${base}/api/payments/${id}/${action}`, {
    method: 'POST',
    headers: autobotHeaders(),
    timeoutMs: 20_000,
  });
  return { ok: true, result };
}

export async function autobotCreateBattle(input: {
  eventId: string;
  singerA: number;
  singerB: number;
}): Promise<unknown> {
  const base = env.autobot.baseUrl;
  if (!base) throw new Error('AUTOBOT_BASE_URL is not configured');
  if (!/^[A-Za-z0-9._:-]{1,60}$/.test(input.eventId)) throw new Error('Invalid event id');
  if (!Number.isInteger(input.singerA) || !Number.isInteger(input.singerB)) throw new Error('Invalid singer id');

  return fetchJson<unknown>(`${base}/api/battles/create`, {
    method: 'POST',
    headers: autobotHeaders(),
    body: { event_id: input.eventId, singer_a: input.singerA, singer_b: input.singerB },
    timeoutMs: 20_000,
  });
}
