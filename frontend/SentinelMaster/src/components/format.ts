/**
 * Formatting helpers shared by every dashboard surface. Nothing here touches
 * the network or the DOM, so it is safe to import from server or client code.
 */

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-MY');
}

export function formatMoney(amount: number | null | undefined, currency = 'MYR'): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatMb(mb: number | null | undefined): string {
  if (mb === null || mb === undefined || !Number.isFinite(mb)) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function formatElapsed(fromIso: string | number | null | undefined, toIso?: string | null): string {
  if (!fromIso) return '—';
  const start = typeof fromIso === 'number' ? fromIso : Date.parse(fromIso);
  if (!Number.isFinite(start)) return '—';
  const end = toIso ? Date.parse(toIso) : Date.now();
  if (!Number.isFinite(end)) return '—';
  return formatDuration(Math.max(0, end - start));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return iso;
  return new Date(value).toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return iso;
  const diff = Date.now() - value;
  if (Math.abs(diff) < 45_000) return 'just now';
  return diff >= 0 ? `${formatDuration(diff)} ago` : `in ${formatDuration(-diff)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Splits possibly-multiline git output into display lines. */
export function toLines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

export type Tone = 'grey' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const PAYMENT_TONES: Record<string, Tone> = {
  completed: 'green',
  pending: 'amber',
  rejected: 'red',
  failed: 'red',
  refunded: 'violet',
};

export function paymentTone(status: string | null | undefined): Tone {
  if (!status) return 'grey';
  return PAYMENT_TONES[status.toLowerCase()] ?? 'grey';
}

export function pm2Tone(status: string | null | undefined): Tone {
  switch ((status ?? '').toLowerCase()) {
    case 'online':
      return 'green';
    case 'launching':
      return 'blue';
    case 'stopped':
    case 'stopping':
      return 'amber';
    case 'errored':
      return 'red';
    default:
      return 'grey';
  }
}

export function severityTone(severity: string): Tone {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'amber';
    default:
      return 'blue';
  }
}

export function stateTone(state: 'ok' | 'degraded' | 'unconfigured' | string): Tone {
  switch (state) {
    case 'ok':
      return 'green';
    case 'degraded':
      return 'amber';
    case 'unconfigured':
      return 'grey';
    default:
      return 'grey';
  }
}

/** Percentage with a safe fallback, used by resource bars. */
export function percent(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

export function progressTone(value: number | null): string | undefined {
  if (value === null) return undefined;
  if (value >= 90) return 'crit';
  if (value >= 75) return 'warn';
  return undefined;
}
