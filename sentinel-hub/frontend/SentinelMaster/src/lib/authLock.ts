import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

/**
 * Persistent login throttle. State lives on disk so a restart or a PM2 reload
 * cannot be used to reset the attempt counter.
 */

interface AttemptRecord {
  failures: number;
  /** Epoch ms of the first failure in the current window. */
  firstFailureAt: number;
  /** Epoch ms until which logins are refused. 0 when not locked. */
  lockedUntil: number;
  lastAttemptAt: number;
}

interface ThrottleFile {
  version: 1;
  records: Record<string, AttemptRecord>;
}

export interface ThrottleVerdict {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil: number;
  retryAfterSeconds: number;
}

const STATE_DIR = path.join(env.hubDir, '.sentinel-state');
const THROTTLE_FILE = path.join(STATE_DIR, 'auth-throttle.json');
const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_KEYS = 512;

/** Hashes the client identity so no raw IP address is ever written to disk. */
export function clientKey(ip: string | null, userAgent: string | null): string {
  return createHash('sha256')
    .update(`${ip ?? 'unknown'}|${(userAgent ?? 'unknown').slice(0, 128)}`)
    .digest('hex')
    .slice(0, 32);
}

async function readState(): Promise<ThrottleFile> {
  try {
    const raw = await readFile(THROTTLE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ThrottleFile;
    if (parsed && parsed.version === 1 && parsed.records && typeof parsed.records === 'object') {
      return parsed;
    }
  } catch {
    // Missing or corrupt file: start from a clean slate.
  }
  return { version: 1, records: {} };
}

async function writeState(state: ThrottleFile): Promise<void> {
  const keys = Object.keys(state.records);
  if (keys.length > MAX_TRACKED_KEYS) {
    const recent = keys
      .map((key) => [key, state.records[key]!.lastAttemptAt] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TRACKED_KEYS);
    state.records = Object.fromEntries(recent.map(([key]) => [key, state.records[key]!]));
  }
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${THROTTLE_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, THROTTLE_FILE);
}

function prune(record: AttemptRecord, now: number): AttemptRecord {
  if (record.lockedUntil > now) return record;
  if (now - record.firstFailureAt > WINDOW_MS) {
    return { failures: 0, firstFailureAt: 0, lockedUntil: 0, lastAttemptAt: record.lastAttemptAt };
  }
  return { ...record, lockedUntil: 0 };
}

/** True when a login may be attempted right now. */
export async function checkThrottle(key: string): Promise<ThrottleVerdict> {
  const state = await readState();
  const now = Date.now();
  const existing = state.records[key];
  if (!existing) {
    return { allowed: true, remainingAttempts: env.maxAttempts, lockedUntil: 0, retryAfterSeconds: 0 };
  }

  const record = prune(existing, now);
  state.records[key] = record;
  await writeState(state);

  if (record.lockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: record.lockedUntil,
      retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
    };
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(0, env.maxAttempts - record.failures),
    lockedUntil: 0,
    retryAfterSeconds: 0,
  };
}

/** Records a failed login and returns the resulting verdict. */
export async function recordFailure(key: string): Promise<ThrottleVerdict> {
  const state = await readState();
  const now = Date.now();
  const previous = state.records[key] ? prune(state.records[key]!, now) : undefined;

  const failures = (previous?.failures ?? 0) + 1;
  const firstFailureAt = previous && previous.failures > 0 ? previous.firstFailureAt : now;
  const locked = failures >= env.maxAttempts;
  const lockedUntil = locked ? now + env.lockoutMinutes * 60 * 1000 : 0;

  state.records[key] = {
    failures: locked ? 0 : failures,
    firstFailureAt,
    lockedUntil,
    lastAttemptAt: now,
  };
  await writeState(state);

  return {
    allowed: !locked,
    remainingAttempts: locked ? 0 : Math.max(0, env.maxAttempts - failures),
    lockedUntil,
    retryAfterSeconds: locked ? Math.ceil((lockedUntil - now) / 1000) : 0,
  };
}

/** Clears the counter after a successful login. */
export async function clearFailures(key: string): Promise<void> {
  const state = await readState();
  if (!state.records[key]) return;
  delete state.records[key];
  await writeState(state);
}

/** Constant-time comparison for internal admin keys. */
export function keyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
