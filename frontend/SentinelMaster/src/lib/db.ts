import path from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './env';
import { run, ExecFailure } from './exec';

/**
 * Database registry bridge.
 *
 * `db-bridge.py` opens every database through a `file:<path>?mode=ro` URI, so the
 * SQLite driver itself refuses writes — this client cannot mutate a project
 * database even if a route is misused. The only thing the Hub does here is
 * validate arguments, pass credentials through the environment (never argv) and
 * parse the JSON, exactly like `kali.ts`.
 *
 * Why a separate bridge rather than reusing `kali-bridge.py`: the Kali bridge
 * controls PM2 and Docker. Nothing in this surface is allowed to write, and
 * keeping the two apart means a future change to the service manager cannot
 * accidentally widen the database surface.
 */

export const DB_BRIDGE_SCRIPT = 'db-bridge.py';

/** Row payload from `query`. Values are already masked by the bridge. */
export type DbCell = string | number | boolean | null;

export interface DbColumn {
  name: string;
  type: string | null;
  pk?: boolean;
  notNull?: boolean;
  sensitive?: boolean;
}

export interface DbForeignKey {
  id?: number;
  seq?: number;
  table: string;
  from: string;
  to: string;
  onUpdate?: string;
  onDelete?: string;
}

export interface DbTableSummary {
  name: string;
  rows: number | null;
  rowError?: string;
  columns?: DbColumn[];
  indexes?: string[];
  foreignKeys?: DbForeignKey[];
}

export interface DbHolder {
  pid: number;
  name: string;
  mode?: string;
  deleted?: boolean;
  /**
   * The path the holder itself sees. Differs from the registered path when the
   * holder is inside another mount namespace (a container), which is why the
   * bridge matches on inode rather than on this string.
   */
  resolved?: string;
}

export interface DbEntry {
  id: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string | null;
  sha256?: string;
  noise: boolean;
  readable: boolean;
  writable: boolean;
  live: boolean;
  locked?: boolean;
  orphanedWal?: boolean;
  walBytes?: number;
  liveNote?: string;
  holders?: DbHolder[];
  holderCount?: number;
  tableCount: number | null;
  journalMode: string | null;
  domainHints: string[];
  tables: string[];
  views?: number;
  error: string | null;
}

export interface DbDuplicateGroup {
  filename: string;
  copies: number;
  paths: string[];
  sizes: number[];
  tableCounts: number[];
  diverged: boolean;
  schemaMismatch: boolean;
  liveCount?: number;
  lockedCount?: number;
  livePaths?: string[];
  tableCountMin?: number;
  tableCountMax?: number;
}

export interface DbDiscovery {
  success: boolean;
  mode: string;
  roots: string[];
  scannedAt: string;
  total: number;
  managedCount: number;
  noiseCount: number;
  divergedCount: number;
  liveCount?: number;
  lockedCount?: number;
  orphanedWalCount?: number;
  managed: DbEntry[];
  noise: DbEntry[];
  duplicateGroups: DbDuplicateGroup[];
  error?: string;
}

export interface DbInspection {
  id: string;
  path: string;
  engine: string;
  readable: boolean;
  live: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
  sha256?: string;
  tableCount: number;
  rowsTotal: number;
  columnsTotal: number;
  views: number;
  triggers: number;
  integrity: string | null;
  foreignKeyViolations: number | null;
  journalMode: string | null;
  walBytes: number;
  shmBytes: number;
  orphanedWal: boolean;
  overrideRisk: boolean;
  /** True when any process holds the file open, read-only or read/write. */
  locked: boolean;
  risk: string[];
  holders: DbHolder[];
  holderCount: number;
  liveNote?: string;
  domainHints: string[];
  tables: DbTableSummary[];
  error: string | null;
  userVersion?: number | null;
  pageSize?: number | null;
}

export interface DbQueryResult {
  table: string;
  columns: DbColumn[];
  rows: Record<string, DbCell>[];
  total: number;
  limit: number;
  offset: number;
  hasMore?: boolean;
  maskedColumns: string[];
  readOnly: true;
}

/**
 * One table's shape plus a `fingerprint` over the whole schema and the file's
 * `sha256`. Cheap enough to run on a poll; stable enough to detect drift.
 */
export interface DbVerification {
  id: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string | null;
  sha256?: string;
  fingerprint?: string;
  tableCount: number;
  rowsTotal?: number;
  schema?: Record<string, { columns: string[]; rows: number | null }>;
  live: boolean;
  locked?: boolean;
  orphanedWal?: boolean;
  walBytes?: number;
  liveNote?: string;
  holders: DbHolder[];
  holderCount: number;
  error: string | null;
}

/**
 * A consistent, verified copy of a live database.
 *
 * A file-level copy of a WAL database silently drops every transaction still in
 * the write-ahead log, which is why a copied backup can look "reverted". The
 * bridge writes snapshots with `VACUUM INTO` and re-counts the result, so
 * `rowsTotal` here is evidence the snapshot is complete rather than a promise.
 */
export interface DbSnapshot {
  source: string;
  snapshot: string;
  sizeBytes: number;
  createdAt: string;
  sha256: string;
  snapshotDir: string;
  readable: boolean;
  tableCount: number | null;
  rowsTotal: number | null;
  tableNames?: string[];
  integrity: string | null;
  kept: number;
  pruned: string[];
  retained: number;
  error?: string;
}

export interface DbSnapshotList {
  dir: string;
  count: number;
  snapshots: {
    snapshot: string;
    name: string;
    sizeBytes: number;
    modifiedAt: string | null;
  }[];
}

export interface DbComparison {
  left: { id: string; path: string; tableCount: number };
  right: { id: string; path: string; tableCount: number };
  onlyLeft: string[];
  onlyRight: string[];
  tables: {
    name: string;
    leftRows: number | null;
    rightRows: number | null;
    leftColumns: number;
    rightColumns: number;
    rowsMatch: boolean;
    columnsMatch: boolean;
    missingColumns: string[];
    extraColumns: string[];
    identical: boolean;
    reason?: string;
    leftHash?: string;
    rightHash?: string;
  }[];
  counts: {
    compared: number;
    identical: number;
    differing: number;
    onlyLeft: number;
    onlyRight: number;
  };
  verdict: 'identical' | 'diverged';
  readOnly: true;
}

export interface PostgresDatabase {
  name: string;
  sizeBytes: number | null;
  owner?: string | null;
  encoding?: string | null;
  tables?: number | null;
}

export interface PostgresPayload {
  success: boolean;
  available: boolean;
  configured: boolean;
  reason?: string;
  host?: string;
  port?: number;
  databases: PostgresDatabase[];
  error?: string;
}

export class DbNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbNotConfigured';
  }
}

/**
 * `discover` walks every project directory and hashes each database, which
 * costs a full SSH round trip (~2 s against the Kali box). Both the Overview
 * aggregation and the Databases page ask for it, and the sidebar polls the
 * Overview every 60 s, so the result is memoised briefly instead of re-running
 * the sweep on every poll. Concurrent callers share one in-flight promise.
 */
const DISCOVER_TTL_MS = 20_000;
let discoverCache: { at: number; promise: Promise<DbDiscovery> } | null = null;

export function invalidateDiscover(): void {
  discoverCache = null;
}

function scriptPath(name: string): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), name);
}

function pythonBin(): string {
  return env.kali.python;
}

/** True when the Hub can reach a host that owns the databases. */
export function dbConfigured(): { ok: boolean; reason?: string } {
  if (process.platform === 'linux') {
    if (!existsSync(scriptPath(DB_BRIDGE_SCRIPT))) {
      return { ok: false, reason: `${DB_BRIDGE_SCRIPT} is missing from the Hub directory` };
    }
    return { ok: true };
  }
  if (!env.kali.host) return { ok: false, reason: 'KALI_HOST is not configured' };
  if (!env.kali.user) return { ok: false, reason: 'KALI_USER is not configured' };
  if (!env.kali.pass && !env.kali.keyFilename) {
    return { ok: false, reason: 'KALI_KEY_FILENAME or KALI_PASS is required' };
  }
  if (!existsSync(scriptPath(DB_BRIDGE_SCRIPT))) {
    return { ok: false, reason: `${DB_BRIDGE_SCRIPT} is missing from the Hub directory` };
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

async function runBridge(args: string[], timeoutMs: number): Promise<Record<string, unknown>> {
  const gate = dbConfigured();
  if (!gate.ok) throw new DbNotConfigured(gate.reason ?? 'The database host is not configured');

  let stdout: string;
  try {
    const result = await run(pythonBin(), [scriptPath(DB_BRIDGE_SCRIPT), ...args], {
      cwd: process.cwd(),
      timeoutMs,
      env: scriptEnv(),
    });
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof ExecFailure) {
      const parsed = parseBridgeJson(`${error.result.stdout}\n${error.result.stderr}`);
      if (parsed) {
        if (typeof parsed.error === 'string' && parsed.error.length > 0) throw new Error(parsed.error);
        return parsed;
      }
      const detail = (error.result.stderr || error.result.stdout || error.message).trim();
      throw new Error(detail.slice(0, 400) || 'The database bridge failed');
    }
    throw error;
  }

  const parsed = parseBridgeJson(stdout);
  if (!parsed) throw new Error('The database bridge did not return JSON');
  if (typeof parsed.error === 'string' && parsed.error.length > 0) throw new Error(parsed.error);
  return parsed;
}

/** Tolerant parse: the bridge may emit a stray warning before its JSON. */
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

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function mapEntry(raw: unknown): DbEntry {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ''),
    path: String(record.path ?? ''),
    sizeBytes: num(record.sizeBytes),
    modifiedAt: record.modifiedAt ? String(record.modifiedAt) : null,
    sha256: record.sha256 ? String(record.sha256) : undefined,
    noise: Boolean(record.noise),
    readable: Boolean(record.readable),
    writable: Boolean(record.writable),
    live: Boolean(record.live),
    locked: Boolean(record.locked),
    orphanedWal: Boolean(record.orphanedWal),
    walBytes: num(record.walBytes),
    liveNote: record.liveNote ? String(record.liveNote) : undefined,
    holders: Array.isArray(record.holders)
      ? record.holders.map((holder) => {
          const entry = (holder ?? {}) as Record<string, unknown>;
          return {
            pid: num(entry.pid),
            name: String(entry.name ?? 'unknown'),
            mode: entry.mode ? String(entry.mode) : undefined,
            deleted: Boolean(entry.deleted),
            resolved: entry.resolved ? String(entry.resolved) : undefined,
          };
        })
      : [],
    holderCount: num(record.holderCount),
    tableCount: record.tableCount === null || record.tableCount === undefined ? null : num(record.tableCount),
    journalMode: record.journalMode ? String(record.journalMode) : null,
    domainHints: strArray(record.domainHints),
    tables: strArray(record.tables),
    views: record.views === undefined ? undefined : num(record.views),
    error: record.error ? String(record.error) : null,
  };
}

function mapGroup(raw: unknown): DbDuplicateGroup {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    filename: String(record.filename ?? 'unknown'),
    copies: num(record.copies),
    paths: strArray(record.paths),
    sizes: Array.isArray(record.sizes) ? record.sizes.map((value) => num(value)) : [],
    tableCounts: Array.isArray(record.tableCounts)
      ? record.tableCounts.map((value) => num(value, -1))
      : [],
    diverged: Boolean(record.diverged),
    schemaMismatch: Boolean(record.schemaMismatch),
    liveCount: num(record.liveCount),
    lockedCount: num(record.lockedCount),
    livePaths: strArray(record.livePaths),
    tableCountMin: record.tableCountMin === undefined ? undefined : num(record.tableCountMin),
    tableCountMax: record.tableCountMax === undefined ? undefined : num(record.tableCountMax),
  };
}

/** Read-only inventory of every database reachable from the configured host. */
export async function discover(timeoutMs = 90_000): Promise<DbDiscovery> {
  const cached = discoverCache;
  if (cached && Date.now() - cached.at < DISCOVER_TTL_MS) return cached.promise;

  const promise = discoverUncached(timeoutMs);
  discoverCache = { at: Date.now(), promise };
  try {
    return await promise;
  } catch (error) {
    // Never cache a failure: the next caller should retry immediately.
    if (discoverCache?.promise === promise) discoverCache = null;
    throw error;
  }
}

async function discoverUncached(timeoutMs: number): Promise<DbDiscovery> {
  const raw = await runBridge(['discover'], timeoutMs);
  return {
    success: raw.success !== false,
    mode: String(raw.mode ?? 'unknown'),
    roots: strArray(raw.roots),
    scannedAt: String(raw.scannedAt ?? new Date().toISOString()),
    total: num(raw.total),
    managedCount: num(raw.managedCount),
    noiseCount: num(raw.noiseCount),
    liveCount: num(raw.liveCount),
    lockedCount: num(raw.lockedCount),
    orphanedWalCount: num(raw.orphanedWalCount),
    divergedCount: num(raw.divergedCount),
    managed: Array.isArray(raw.managed) ? raw.managed.map(mapEntry) : [],
    noise: Array.isArray(raw.noise) ? raw.noise.map(mapEntry) : [],
    duplicateGroups: Array.isArray(raw.duplicateGroups) ? raw.duplicateGroups.map(mapGroup) : [],
    error: raw.error ? String(raw.error) : undefined,
  };
}

function mapTable(raw: unknown): DbTableSummary {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(record.name ?? ''),
    rows: record.rows === null || record.rows === undefined ? null : num(record.rows),
    rowError: record.rowError ? String(record.rowError) : undefined,
    columns: Array.isArray(record.columns)
      ? record.columns.map((column) => {
          const entry = (column ?? {}) as Record<string, unknown>;
          return {
            name: String(entry.name ?? ''),
            type: entry.type ? String(entry.type) : null,
            pk: Boolean(entry.pk),
            notNull: Boolean(entry.notNull),
            sensitive: Boolean(entry.sensitive),
          };
        })
      : undefined,
    indexes: record.indexes === undefined ? undefined : strArray(record.indexes),
  };
}

/** Full schema, integrity state and lock holders for one database. */
export async function inspect(idOrPath: string, timeoutMs = 90_000): Promise<DbInspection> {
  const raw = await runBridge(['inspect', idOrPath], timeoutMs);
  return {
    id: String(raw.id ?? ''),
    path: String(raw.path ?? idOrPath),
    engine: String(raw.engine ?? 'sqlite'),
    readable: Boolean(raw.readable),
    live: Boolean(raw.live),
    sizeBytes: num(raw.sizeBytes),
    modifiedAt: raw.modifiedAt ? String(raw.modifiedAt) : null,
    sha256: raw.sha256 ? String(raw.sha256) : undefined,
    tableCount: num(raw.tableCount),
    rowsTotal: num(raw.rowsTotal),
    columnsTotal: num(raw.columnsTotal),
    views: num(raw.views),
    triggers: num(raw.triggers),
    integrity: raw.integrity ? String(raw.integrity) : null,
    foreignKeyViolations:
      raw.foreignKeyViolations === null || raw.foreignKeyViolations === undefined
        ? null
        : num(raw.foreignKeyViolations),
    journalMode: raw.journalMode ? String(raw.journalMode) : null,
    walBytes: num(raw.walBytes),
    shmBytes: num(raw.shmBytes),
    orphanedWal: Boolean(raw.orphanedWal),
    overrideRisk: Boolean(raw.overrideRisk),
    locked: Boolean(raw.locked),
    risk: strArray(raw.risk),
    holders: Array.isArray(raw.holders)
      ? raw.holders.map((holder) => {
          const entry = (holder ?? {}) as Record<string, unknown>;
          return {
            pid: num(entry.pid),
            name: String(entry.name ?? 'unknown'),
            mode: entry.mode ? String(entry.mode) : undefined,
            deleted: Boolean(entry.deleted),
            resolved: entry.resolved ? String(entry.resolved) : undefined,
          };
        })
      : [],
    holderCount: num(raw.holderCount),
    liveNote: raw.liveNote ? String(raw.liveNote) : undefined,
    domainHints: strArray(raw.domainHints),
    tables: Array.isArray(raw.tables) ? raw.tables.map(mapTable) : [],
    error: raw.error ? String(raw.error) : null,
    userVersion: raw.userVersion === undefined ? undefined : num(raw.userVersion),
    pageSize: raw.pageSize === undefined ? undefined : num(raw.pageSize),
  };
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
}/** Cheap schema fingerprint plus lock holders — for drift checks. */
export async function verify(idOrPath: string, timeoutMs = 90_000): Promise<DbVerification> {
  const raw = await runBridge(['verify', idOrPath], timeoutMs);
  return {
    id: String(raw.id ?? ''),
    path: String(raw.path ?? idOrPath),
    sizeBytes: num(raw.sizeBytes),
    modifiedAt: raw.modifiedAt ? String(raw.modifiedAt) : null,
    sha256: raw.sha256 ? String(raw.sha256) : undefined,
    fingerprint: raw.fingerprint ? String(raw.fingerprint) : undefined,
    tableCount: num(raw.tableCount),
    rowsTotal: raw.rowsTotal === undefined ? undefined : num(raw.rowsTotal),
    schema:
      raw.schema && typeof raw.schema === 'object'
        ? Object.fromEntries(
            Object.entries(raw.schema as Record<string, unknown>).map(([name, shape]) => {
              const record = (shape ?? {}) as Record<string, unknown>;
              return [
                name,
                {
                  columns: strArray(record.columns),
                  rows: record.rows === null || record.rows === undefined ? null : num(record.rows),
                },
              ];
            }),
          )
        : undefined,
    live: Boolean(raw.live),
    locked: raw.locked === undefined ? undefined : Boolean(raw.locked),
    orphanedWal: raw.orphanedWal === undefined ? undefined : Boolean(raw.orphanedWal),
    walBytes: raw.walBytes === undefined ? undefined : num(raw.walBytes),
    liveNote: raw.liveNote ? String(raw.liveNote) : undefined,
    holders: Array.isArray(raw.holders)
      ? raw.holders.map((holder) => {
          const entry = (holder ?? {}) as Record<string, unknown>;
          return {
            pid: num(entry.pid),
            name: String(entry.name ?? 'unknown'),
            mode: entry.mode ? String(entry.mode) : undefined,
            deleted: Boolean(entry.deleted),
            resolved: entry.resolved ? String(entry.resolved) : undefined,
          };
        })
      : [],
    holderCount: num(raw.holderCount),
    error: raw.error ? String(raw.error) : null,
  };
}

/** Paged, masked preview of one table. Sensitive columns never leave the host. */
export async function queryTable(
  idOrPath: string,
  table: string,
  options: QueryOptions = {},
  timeoutMs = 60_000,
): Promise<DbQueryResult> {
  const args = ['query', idOrPath, table];
  if (options.limit !== undefined) args.push('--limit', String(options.limit));
  if (options.offset !== undefined) args.push('--offset', String(options.offset));
  if (options.search) args.push('--search', options.search);

  const raw = await runBridge(args, timeoutMs);
  return {
    table: String(raw.table ?? table),
    columns: Array.isArray(raw.columns)
      ? raw.columns.map((column) => {
          const entry = (column ?? {}) as Record<string, unknown>;
          return {
            name: String(entry.name ?? ''),
            type: entry.type ? String(entry.type) : null,
            pk: Boolean(entry.pk),
            sensitive: Boolean(entry.sensitive),
          };
        })
      : [],
    rows: Array.isArray(raw.rows) ? (raw.rows as Record<string, DbCell>[]) : [],
    total: num(raw.total),
    limit: num(raw.limit, options.limit ?? 0),
    offset: num(raw.offset, options.offset ?? 0),
    hasMore: Boolean(raw.hasMore),
    maskedColumns: strArray(raw.maskedColumns),
    readOnly: true,
  };
}

/**
 * Writes a consistent, self-verified copy of a database.
 *
 * This is the only supported backup path: a plain file copy of a WAL database
 * loses committed transactions, which is the mechanism behind databases that
 * appear to revert on their own.
 */
export async function snapshot(
  idOrPath: string,
  options: { keep?: number; dir?: string } = {},
  timeoutMs = 300_000,
): Promise<DbSnapshot> {
  const args = ['snapshot', idOrPath];
  if (options.keep !== undefined) args.push('--keep', String(options.keep));
  if (options.dir) args.push('--dir', options.dir);

  const raw = await runBridge(args, timeoutMs);
  return {
    source: String(raw.source ?? idOrPath),
    snapshot: String(raw.snapshot ?? ''),
    sizeBytes: num(raw.sizeBytes),
    createdAt: String(raw.createdAt ?? ''),
    sha256: String(raw.sha256 ?? ''),
    snapshotDir: String(raw.snapshotDir ?? ''),
    readable: Boolean(raw.readable),
    tableCount: raw.tableCount === null || raw.tableCount === undefined ? null : num(raw.tableCount),
    rowsTotal: raw.rowsTotal === null || raw.rowsTotal === undefined ? null : num(raw.rowsTotal),
    tableNames: strArray(raw.tableNames),
    integrity: raw.integrity ? String(raw.integrity) : null,
    kept: num(raw.kept),
    pruned: strArray(raw.pruned),
    retained: num(raw.retained),
    error: raw.error ? String(raw.error) : undefined,
  };
}

/** Lists the snapshots already on disk, newest first. */
export async function snapshots(
  options: { dir?: string } = {},
  timeoutMs = 60_000,
): Promise<DbSnapshotList> {
  const args = ['snapshots'];
  if (options.dir) args.push('--dir', options.dir);

  const raw = await runBridge(args, timeoutMs);
  return {
    dir: String(raw.dir ?? ''),
    count: num(raw.count),
    snapshots: Array.isArray(raw.snapshots)
      ? raw.snapshots.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            snapshot: String(row.snapshot ?? ''),
            name: String(row.name ?? ''),
            sizeBytes: num(row.sizeBytes),
            modifiedAt: row.modifiedAt ? String(row.modifiedAt) : null,
          };
        })
      : [],
  };
}

/** Structural and content diff between two databases. */
export async function compare(left: string, right: string, timeoutMs = 120_000): Promise<DbComparison> {
  const raw = await runBridge(['compare', left, right], timeoutMs);
  const side = (value: unknown, fallback: string) => {
    const record = (value ?? {}) as Record<string, unknown>;
    return {
      id: String(record.id ?? ''),
      path: String(record.path ?? fallback),
      tableCount: num(record.tableCount),
    };
  };

  return {
    left: side(raw.left, left),
    right: side(raw.right, right),
    onlyLeft: strArray(raw.onlyLeft),
    onlyRight: strArray(raw.onlyRight),
    tables: Array.isArray(raw.tables)
      ? raw.tables.map((table) => {
          const entry = (table ?? {}) as Record<string, unknown>;
          return {
            name: String(entry.name ?? ''),
            leftRows: entry.leftRows === null || entry.leftRows === undefined ? null : num(entry.leftRows),
            rightRows: entry.rightRows === null || entry.rightRows === undefined ? null : num(entry.rightRows),
            leftColumns: num(entry.leftColumns),
            rightColumns: num(entry.rightColumns),
            rowsMatch: Boolean(entry.rowsMatch),
            columnsMatch: Boolean(entry.columnsMatch),
            missingColumns: strArray(entry.missingColumns),
            extraColumns: strArray(entry.extraColumns),
            identical: Boolean(entry.identical),
            reason: entry.reason ? String(entry.reason) : undefined,
            leftHash: entry.leftHash ? String(entry.leftHash) : undefined,
            rightHash: entry.rightHash ? String(entry.rightHash) : undefined,
          };
        })
      : [],
    counts: (() => {
      const record = (raw.counts ?? {}) as Record<string, unknown>;
      return {
        compared: num(record.compared),
        identical: num(record.identical),
        differing: num(record.differing),
        onlyLeft: num(record.onlyLeft),
        onlyRight: num(record.onlyRight),
      };
    })(),
    verdict: raw.verdict === 'identical' ? 'identical' : 'diverged',
    readOnly: true,
  };
}

/**
 * Postgres databases. Reported as unavailable rather than thrown when the
 * server is missing, because "no Postgres here" is a state, not a failure.
 */
export async function postgres(timeoutMs = 60_000): Promise<PostgresPayload> {
  try {
    const raw = await runBridge(['postgres'], timeoutMs);
    return {
      success: raw.success !== false,
      available: Boolean(raw.available),
      configured: Boolean(raw.configured),
      reason: raw.reason ? String(raw.reason) : undefined,
      host: raw.host ? String(raw.host) : undefined,
      port: raw.port === undefined ? undefined : num(raw.port),
      databases: Array.isArray(raw.databases)
        ? raw.databases.map((database) => {
            const entry = (database ?? {}) as Record<string, unknown>;
            return {
              name: String(entry.name ?? ''),
              sizeBytes:
                entry.sizeBytes === null || entry.sizeBytes === undefined ? null : num(entry.sizeBytes),
              owner: entry.owner ? String(entry.owner) : null,
              encoding: entry.encoding ? String(entry.encoding) : null,
              tables: entry.tables === null || entry.tables === undefined ? null : num(entry.tables),
            };
          })
        : [],
      error: raw.error ? String(raw.error) : undefined,
    };
  } catch (error) {
    if (error instanceof DbNotConfigured) {
      return {
        success: false,
        available: false,
        configured: false,
        reason: error.message,
        databases: [],
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      available: false,
      configured: true,
      reason: message,
      databases: [],
      error: message,
    };
  }
}

/** Maps a thrown bridge error to an HTTP status, matching `describeKaliError`. */
export function describeDbError(error: unknown): { status: number; message: string } {
  if (error instanceof DbNotConfigured) return { status: 503, message: error.message };

  const message = error instanceof Error ? error.message : String(error);
  if (/does not exist in this database|invalid table name|no database in the registry|requires/i.test(message)) {
    return { status: 400, message };
  }
  if (/timed out|timeout/i.test(message)) return { status: 504, message };
  return { status: 502, message };
}
