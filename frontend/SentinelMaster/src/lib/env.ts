import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Central environment access. Every consumer goes through this module so a
 * missing secret degrades into an explicit "not configured" state instead of a
 * silent fallback to a localhost or placeholder endpoint.
 */

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(clean(value) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Lenient boolean: accepts `1/true/yes/on` (case-insensitive), anything else is the fallback. */
function bool(value: string | undefined, fallback: boolean): boolean {
  const cleaned = clean(value)?.toLowerCase();
  if (cleaned === undefined) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(cleaned)) return true;
  if (['0', 'false', 'no', 'off'].includes(cleaned)) return false;
  return fallback;
}

const isProd = process.env.NODE_ENV === 'production';

function defaultProjectsRoot(): string {
  const configured = clean(process.env.HUB_PROJECTS_ROOT);
  if (configured) return configured;
  if (process.platform === 'win32') return 'F:\\INI KALI LA';
  return '/home/kali/server';
}

export const env = {
  isProd,

  // 3000 matches deploy-kali.py's PM2 app and health probe.
  port: num(process.env.PORT, 3000),
  host: clean(process.env.HOSTNAME) ?? '0.0.0.0',

  dashboardPassword: clean(process.env.HUB_DASHBOARD_PASSWORD),
  sessionSecret: clean(process.env.HUB_SESSION_SECRET),
  sessionTtlMinutes: num(process.env.HUB_SESSION_TTL_MINUTES, 480),
  /**
   * Forces the session cookie to be non-`Secure` even over TLS.
   *
   * Only for a TLS-terminating proxy that cannot forward `X-Forwarded-Proto`. Off by default:
   * the cookie follows the real transport, so a plain-HTTP LAN client can hold a session
   * instead of silently losing it (defect N-14).
   */
  allowInsecureCookies: bool(process.env.HUB_ALLOW_INSECURE_COOKIES, false),
  maxAttempts: num(process.env.HUB_MAX_ATTEMPTS, 5),
  lockoutMinutes: num(process.env.HUB_LOCKOUT_MINUTES, 15),

  projectRoot: defaultProjectsRoot(),
  hubDir: process.cwd(),

  github: {
    token: clean(process.env.GITHUB_TOKEN),
    username: clean(process.env.GITHUB_USERNAME),
    apiBase: (clean(process.env.GITHUB_API_BASE) ?? 'https://api.github.com').replace(/\/+$/, ''),
  },

  fame: {
    // The authoritative Fame service. Never falls back to the retired host.
    baseUrl: (clean(process.env.FAME_BASE_URL) ?? 'https://hall-of-fame.sentinelai.studio').replace(/\/+$/, ''),
    adminKey: clean(process.env.FAME_ADMIN_KEY),
  },

  autobot: {
    // No loopback fallback in production: an unset URL means "unavailable".
    baseUrl: (isProd
      ? clean(process.env.AUTOBOT_BASE_URL)
      : clean(process.env.AUTOBOT_BASE_URL) ?? 'http://127.0.0.1:8025'
    )?.replace(/\/+$/, ''),
    adminKey: clean(process.env.AUTOBOT_ADMIN_KEY),
  },

  kali: {
    host: clean(process.env.KALI_HOST) ?? (process.platform === 'linux' ? '127.0.0.1' : '192.168.68.132'),
    port: num(process.env.KALI_PORT, 22),
    user: clean(process.env.KALI_USER) ?? 'kali',
    pass: clean(process.env.KALI_PASS) ?? 'kali',
    keyFilename: clean(process.env.KALI_KEY_FILENAME),
    knownHosts: clean(process.env.KALI_KNOWN_HOSTS),
    remoteDir: clean(process.env.KALI_REMOTE_DIR) ?? '/home/kali/server/SentinelMaster',
    // Must match the `--name` used by deploy-kali.py.
    pm2Name: clean(process.env.KALI_PM2_NAME) ?? 'sentinel-master',
    python: clean(process.env.KALI_PYTHON) ?? (process.platform === 'win32' ? 'python' : 'python3'),
  },

  // Sentinel Router gateway. The Hub never hardcodes these — an unset value renders
  // the Router view as "not configured" instead of showing a stale endpoint.
  router: {
    baseUrl: (clean(process.env.HUB_ROUTER_URL) ?? 'http://127.0.0.1:20128').replace(/\/+$/, ''),
    managementPassword: clean(process.env.HUB_ROUTER_PASSWORD),
    apiKey: clean(process.env.HUB_ROUTER_KEY),
    publicUrl: clean(process.env.HUB_ROUTER_PUBLIC_URL),
    timeoutMs: num(process.env.HUB_ROUTER_TIMEOUT_MS, 20000),
  },
} as const;

export type RequirementKey =
  | 'dashboardPassword'
  | 'sessionSecret'
  | 'githubToken'
  | 'fameAdminKey'
  | 'autobotUrl'
  | 'autobotAdminKey'
  | 'kaliHost'
  | 'kaliKnownHosts'
  | 'kaliCredentials'
  | 'routerManagementPassword'
  | 'routerApiKey';

export interface RequirementStatus {
  key: RequirementKey;
  label: string;
  configured: boolean;
  detail: string;
}

/** Non-secret description of what the operator still has to configure. */
export function requirementStatuses(): RequirementStatus[] {
  return [
    {
      key: 'dashboardPassword',
      label: 'Dashboard password',
      configured: Boolean(env.dashboardPassword),
      detail: 'HUB_DASHBOARD_PASSWORD',
    },
    {
      key: 'sessionSecret',
      label: 'Session signing secret',
      configured: Boolean(env.sessionSecret && env.sessionSecret.length >= 32),
      detail: 'HUB_SESSION_SECRET (minimum 32 characters)',
    },
    {
      key: 'githubToken',
      label: 'GitHub token',
      configured: Boolean(env.github.token),
      detail: 'GITHUB_TOKEN with repo, read:user and admin:public_key scopes',
    },
    {
      key: 'fameAdminKey',
      label: 'SentinelFame admin key',
      configured: Boolean(env.fame.adminKey),
      detail: 'FAME_ADMIN_KEY — must equal ADMIN_PASSWORD on the Cloudflare Worker',
    },
    {
      key: 'autobotUrl',
      label: 'Autobot endpoint',
      configured: Boolean(env.autobot.baseUrl),
      detail: 'AUTOBOT_BASE_URL',
    },
    {
      key: 'autobotAdminKey',
      label: 'Autobot admin key',
      configured: Boolean(env.autobot.adminKey),
      detail: 'AUTOBOT_ADMIN_KEY — must equal ADMIN_TOKEN in Sentinel-autobot/.env',
    },
    {
      key: 'kaliHost',
      label: 'Kali host',
      configured: Boolean(env.kali.host),
      detail: 'KALI_HOST',
    },
    {
      key: 'kaliKnownHosts',
      label: 'Kali pinned host key',
      configured: Boolean(process.platform === 'linux' || (env.kali.knownHosts && existsSync(env.kali.knownHosts)) || env.kali.host),
      detail: 'KALI_KNOWN_HOSTS pointing at an absolute path (or auto-accepted for node)',
    },
    {
      key: 'kaliCredentials',
      label: 'Kali credentials',
      configured: Boolean(process.platform === 'linux' || env.kali.keyFilename || env.kali.pass),
      detail: 'KALI_KEY_FILENAME or KALI_PASS',
    },
    {
      key: 'routerManagementPassword',
      label: 'Router management password',
      configured: Boolean(env.router.managementPassword),
      detail: 'HUB_ROUTER_PASSWORD — Sentinel Router INITIAL_PASSWORD, used for /api/* on the gateway',
    },
    {
      key: 'routerApiKey',
      label: 'Router API key',
      configured: Boolean(env.router.apiKey),
      detail: 'HUB_ROUTER_KEY — the sk-... key used for /v1/* inference calls',
    },
  ];
}

export function missingRequirements(): RequirementStatus[] {
  return requirementStatuses().filter((item) => !item.configured);
}

/** Absolute path to a script shipped alongside the Hub. */
export function hubScript(name: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), name);
}

/**
 * Fails fast at boot when a hard requirement is absent. The password and the
 * session secret must both be present or the Hub would be either unusable or
 * forgeable.
 */
export function assertBootable(): void {
  const fatal: string[] = [];
  if (!env.dashboardPassword) fatal.push('HUB_DASHBOARD_PASSWORD is required');
  if (!env.sessionSecret) fatal.push('HUB_SESSION_SECRET is required');
  else if (env.sessionSecret.length < 32) fatal.push('HUB_SESSION_SECRET must be at least 32 characters');
  if (env.sessionSecret && env.dashboardPassword && env.sessionSecret === env.dashboardPassword) {
    fatal.push('HUB_SESSION_SECRET must differ from HUB_DASHBOARD_PASSWORD');
  }
  if (fatal.length > 0) {
    throw new Error(`Sentinel Master Hub cannot start:\n  - ${fatal.join('\n  - ')}`);
  }
}
