import path from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './env';
import { run, ExecFailure } from './exec';

/**
 * Kali Linux operations bridge.
 *
 * Both scripts are pre-existing, hardened, and JSON-emitting, so the Hub only
 * validates arguments, passes credentials through the environment (never argv),
 * and parses the JSON. `shell: false` in `run()` means a service name that
 * looks like a command is treated as a literal argument — and the bridge
 * validates it again with a strict `[A-Za-z0-9_.-]+` pattern.
 */

export const BRIDGE_SCRIPT = 'kali-bridge.py';
export const DEPLOY_SCRIPT = 'deploy-kali.py';

export interface Pm2Process {
  name: string;
  status: string;
  type: 'website' | 'bot' | 'service' | string;
  cpu: number;
  memoryMb: number;
  restarts: number;
  uptimeMs: number | null;
  script: string | null;
  cwd: string | null;
  pid: number | null;
  /** Launch arguments. Some processes name their project directory only here. */
  args?: string[] | null;
}

export interface ServiceProbe {
  operational: boolean;
  httpCode?: number | null;
  latencyMs?: number | null;
}

export interface KaliStatus {
  success: boolean;
  host: string;
  pingMs: number | null;
  system: {
    uptime: string;
    ram: { totalMb: number; usedMb: number; freeMb: number; percent: number } | null;
    disk: { mount?: string; size: string; used: string; avail: string; percent: number } | null;
  };
  pm2: Pm2Process[];
  pm2Summary: {
    total: number;
    online: number;
    stopped: number;
    errored: number;
    byType: { website: number; bot: number; service: number };
    cpuPercent: number;
    memoryMb: number;
    restarts: number;
  };
  activePorts: number[];
  probes?: Record<string, ServiceProbe>;
  syncedAt: string;
  error?: string;
}

export class KaliNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KaliNotConfigured';
  }
}

function scriptPath(name: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), name);
}

function pythonBin(): string {
  return env.kali.python;
}

/** True when enough is configured to communicate with the host / node. */
export function kaliConfigured(): { ok: boolean; reason?: string } {
  if (process.platform === 'linux') {
    if (!existsSync(scriptPath(BRIDGE_SCRIPT))) {
      return { ok: false, reason: `${BRIDGE_SCRIPT} is missing from the Hub directory` };
    }
    return { ok: true };
  }
  if (!env.kali.host) return { ok: false, reason: 'KALI_HOST is not configured' };
  if (!env.kali.user) return { ok: false, reason: 'KALI_USER is not configured' };
  if (!env.kali.pass && !env.kali.keyFilename) {
    return { ok: false, reason: 'KALI_KEY_FILENAME or KALI_PASS is required' };
  }
  if (!existsSync(scriptPath(BRIDGE_SCRIPT))) {
    return { ok: false, reason: `${BRIDGE_SCRIPT} is missing from the Hub directory` };
  }
  return { ok: true };
}

function scriptEnv(): Record<string, string> {
  return {
    KALI_HOST: env.kali.host ?? '',
    KALI_PORT: String(env.kali.port),
    KALI_USER: env.kali.user ?? '',
    ...(env.kali.pass ? { KALI_PASS: env.kali.pass } : {}),
    ...(env.kali.keyFilename ? { KALI_KEY_FILENAME: env.kali.keyFilename } : {}),
    ...(env.kali.knownHosts ? { KALI_KNOWN_HOSTS: env.kali.knownHosts } : {}),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
  };
}

async function runBridge(
  args: string[],
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const gate = kaliConfigured();
  if (!gate.ok) throw new KaliNotConfigured(gate.reason ?? 'Kali is not configured');

  let stdout: string;
  try {
    const result = await run(pythonBin(), [scriptPath(BRIDGE_SCRIPT), ...args], {
      cwd: process.cwd(),
      timeoutMs,
      env: scriptEnv(),
    });
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof ExecFailure) {
      // The bridge prints a JSON error object on stdout before exiting non-zero.
      const parsed = parseBridgeJson(`${error.result.stdout}\n${error.result.stderr}`);
      if (parsed) {
        if (typeof parsed.error === 'string' && parsed.error.length > 0) throw new Error(parsed.error);
        return parsed;
      }
      const detail = (error.result.stderr || error.result.stdout || error.message).trim();
      throw new Error(detail.slice(0, 400) || 'Kali bridge failed');
    }
    throw error;
  }

  const parsed = parseBridgeJson(stdout);
  if (!parsed) throw new Error('Kali bridge did not return JSON');
  if (typeof parsed.error === 'string' && parsed.error.length > 0) throw new Error(parsed.error);
  return parsed;
}

/** Tolerant parse: the bridge may emit leading warnings or a stray banner. */
function parseBridgeJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    /* fall through to line scan */
  }
  const lines = trimmed.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!.trim();
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapPm2(raw: unknown): Pm2Process {
  const record = (raw ?? {}) as Record<string, unknown>;
  const pm2Env = (record.pm2_env ?? {}) as Record<string, unknown>;
  const rawUptime = record.uptime ?? pm2Env.pm_uptime;
  const uptimeMs =
    rawUptime === undefined || rawUptime === null
      ? null
      : typeof rawUptime === 'number' && rawUptime > 1_000_000_000
      ? Date.now() - num(rawUptime)
      : num(rawUptime);
  const pidVal = record.pid ?? pm2Env.pid;
  const rawArgs = record.args ?? pm2Env.args;
  return {
    name: String(record.name ?? 'unnamed'),
    status: String(record.status ?? 'unknown'),
    type: String(record.type ?? 'service'),
    cpu: num(record.cpu),
    memoryMb: num(record.memoryMb),
    restarts: num(record.restarts),
    uptimeMs: uptimeMs !== null && uptimeMs >= 0 ? uptimeMs : null,
    script: record.script ? String(record.script) : pm2Env.pm_exec_path ? String(pm2Env.pm_exec_path) : null,
    cwd: record.cwd ? String(record.cwd) : pm2Env.pm_cwd ? String(pm2Env.pm_cwd) : null,
    pid: pidVal === undefined || pidVal === null ? null : num(pidVal),
    // PM2 reports `args` either as a string or an argv array depending on how the
    // app was started, so both shapes are normalised to a string array.
    args: Array.isArray(rawArgs)
      ? rawArgs.map((item) => String(item))
      : typeof rawArgs === 'string' && rawArgs.trim()
        ? [rawArgs]
        : null,
  };
}

const EMPTY_SUMMARY: KaliStatus['pm2Summary'] = {
  total: 0,
  online: 0,
  stopped: 0,
  errored: 0,
  byType: { website: 0, bot: 0, service: 0 },
  cpuPercent: 0,
  memoryMb: 0,
  restarts: 0,
};

export async function getStatus(): Promise<KaliStatus> {
  const payload = await runBridge(['status'], 45_000);
  const system = (payload.system ?? {}) as Record<string, unknown>;
  const summary = (payload.pm2Summary ?? {}) as Record<string, unknown>;
  const byType = (summary.byType ?? {}) as Record<string, unknown>;
  const ram = system.ram as Record<string, unknown> | null | undefined;
  const disk = system.disk as Record<string, unknown> | null | undefined;

  return {
    success: payload.success !== false,
    host: String(payload.host ?? env.kali.host ?? 'unknown'),
    pingMs: payload.pingMs === undefined || payload.pingMs === null ? null : num(payload.pingMs),
    system: {
      uptime: String(system.uptime ?? 'unknown'),
      ram: ram
        ? {
            totalMb: num(ram.totalMb),
            usedMb: num(ram.usedMb),
            freeMb: num(ram.freeMb),
            percent: num(ram.percent),
          }
        : null,
      disk: disk
        ? {
            mount: disk.mount ? String(disk.mount) : undefined,
            size: String(disk.size ?? '?'),
            used: String(disk.used ?? '?'),
            avail: String(disk.avail ?? '?'),
            percent: num(String(disk.percent ?? '0').replace('%', '')),
          }
        : null,
    },
    pm2: Array.isArray(payload.pm2) ? payload.pm2.map(mapPm2) : [],
    pm2Summary: {
      total: num(summary.total),
      online: num(summary.online),
      stopped: num(summary.stopped),
      errored: num(summary.errored),
      byType: {
        website: num(byType.website),
        bot: num(byType.bot),
        service: num(byType.service),
      },
      cpuPercent: num(summary.cpuPercent),
      memoryMb: num(summary.memoryMb),
      restarts: num(summary.restarts),
    },
    activePorts: Array.isArray(payload.activePorts) ? payload.activePorts.map((p) => num(p)) : [],
    probes: (payload.probes as Record<string, ServiceProbe>) ?? {},
    syncedAt: new Date().toISOString(),
  };
}

export interface KaliLogs {
  service: string;
  lines: number;
  log: string;
  syncedAt: string;
}

export async function getLogs(service: string, lineCount = 120): Promise<KaliLogs> {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(service)) throw new Error('Invalid service name');
  const safeLines = Math.min(Math.max(1, Math.trunc(lineCount) || 120), 500);

  const payload = await runBridge(['logs', service, String(safeLines)], 60_000);
  return {
    service: String(payload.service ?? service),
    lines: num(payload.lines, safeLines),
    log: String(payload.log ?? 'No log entries found.'),
    syncedAt: new Date().toISOString(),
  };
}

export type KaliAction = 'restart' | 'stop' | 'reload' | 'start';

export interface KaliActionResult {
  action: KaliAction;
  target: string;
  output: string;
  syncedAt: string;
}

export async function doAction(action: KaliAction, target = 'all'): Promise<KaliActionResult> {
  if (!['restart', 'stop', 'reload', 'start'].includes(action)) throw new Error('Invalid action');
  const safeTarget = target === 'all' ? 'all' : target;
  if (safeTarget !== 'all' && !/^[A-Za-z0-9_.-]{1,128}$/.test(safeTarget)) {
    throw new Error('Invalid PM2 target name');
  }

  const payload = await runBridge(['action', action, safeTarget], 90_000);
  return {
    action,
    target: String(payload.target ?? safeTarget),
    output: String(payload.output ?? ''),
    syncedAt: new Date().toISOString(),
  };
}

export interface DeployResult {
  ok: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

/**
 * Runs the full remote deployment. Long-running by nature (archive, SFTP,
 * npm install, next build, PM2 restart, health check), so it gets a 15 minute
 * ceiling and returns the complete transcript for the operator.
 */
export async function deploy(): Promise<DeployResult> {
  const gate = kaliConfigured();
  if (!gate.ok) throw new KaliNotConfigured(gate.reason ?? 'Kali is not configured');
  if (!existsSync(scriptPath(DEPLOY_SCRIPT))) {
    throw new KaliNotConfigured(`${DEPLOY_SCRIPT} is missing from the Hub directory`);
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  let output = '';
  let exitCode = 0;
  try {
    const result = await run(pythonBin(), [scriptPath(DEPLOY_SCRIPT)], {
      cwd: process.cwd(),
      timeoutMs: 15 * 60_000,
      env: {
        ...scriptEnv(),
        KALI_REMOTE_DIR: env.kali.remoteDir,
        NODE_ENV: 'production',
      },
    });
    output = `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    if (error instanceof ExecFailure) {
      output = `${error.result.stdout}\n${error.result.stderr}`;
      exitCode = error.result.code || 1;
    } else {
      throw error;
    }
  }

  const finishedAt = new Date().toISOString();
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '').trim();

  return {
    ok: exitCode === 0 && /successfully deployed|deployed and healthy/i.test(clean),
    exitCode,
    output: clean.slice(-40_000),
    durationMs: Date.now() - startedMs,
    startedAt,
    finishedAt,
  };
}

export interface CommandExecResult {
  success: boolean;
  command: string;
  output: string;
  error?: string;
  exit_code: number;
}

export async function runServerCommand(command: string): Promise<CommandExecResult> {
  const payload = await runBridge(['exec', command], 45_000);
  return {
    success: Boolean(payload.success),
    command: String(payload.command ?? command),
    output: String(payload.output ?? ''),
    error: payload.error ? String(payload.error) : undefined,
    exit_code: num(payload.exit_code, 0),
  };
}

export interface DbHealthResult {
  exists: boolean;
  path?: string;
  size_mb?: number;
  integrity?: string;
  journal_mode?: string;
  tables?: number;
  error?: string;
}

export async function checkDatabaseHealth(): Promise<DbHealthResult> {
  const payload = await runBridge(['db_check'], 20_000);
  return {
    exists: Boolean(payload.exists),
    path: payload.path ? String(payload.path) : undefined,
    size_mb: typeof payload.size_mb === 'number' ? payload.size_mb : undefined,
    integrity: payload.integrity ? String(payload.integrity) : undefined,
    journal_mode: payload.journal_mode ? String(payload.journal_mode) : undefined,
    tables: typeof payload.tables === 'number' ? payload.tables : undefined,
    error: payload.error ? String(payload.error) : undefined,
  };
}

export async function cleanOrphanProcesses(): Promise<{ success: boolean; output: string }> {
  const payload = await runBridge(['kill_orphans'], 20_000);
  return {
    success: Boolean(payload.success),
    output: String(payload.output ?? ''),
  };
}

export function describeKaliError(error: unknown): { status: number; message: string } {
  if (error instanceof KaliNotConfigured) return { status: 503, message: error.message };
  if (error instanceof Error) {
    const message = error.message;
    if (/timed out|timeout/i.test(message)) {
      return { status: 504, message: `Kali bridge timed out: ${message}` };
    }
    if (/Authentication|auth|password|key/i.test(message) && /fail|denied|invalid/i.test(message)) {
      return { status: 502, message: `Kali SSH authentication failed: ${message}` };
    }
    if (/not found|no such|unreachable|refused|timed out/i.test(message)) {
      return { status: 502, message: `Kali unreachable: ${message}` };
    }
    return { status: 502, message };
  }
  return { status: 500, message: 'Kali operation failed' };
}
