/**
 * Pure derivation logic binding project directories to PM2 processes.
 *
 * Split from `project-runtime.ts` because that module reaches for the Kali
 * bridge, and therefore `node:path` and `node:child_process`. Client components
 * need `hubProcessName()` and `aggregateState()` to render run/stop controls, so
 * the dependency-free half lives here where it is safe to import from a
 * `'use client'` module.
 *
 * There is no manifest to rely on: the 45 projects predate any convention, and
 * the Kali PM2 table is the single source of truth for what is actually
 * running. The binding is therefore *derived* — PM2 reports the working
 * directory it launched each process from, and that path is matched against the
 * project's real path.
 *
 * Deriving rather than declaring matters here for one specific reason: a stale
 * manifest could claim a project owns a port it does not, and the operator
 * would be told they restarted something they did not.
 *
 * The real mapping is irregular, which is what drives the algorithm below:
 *   - a project may own several processes (`SentinelAI` -> backend + frontend)
 *   - a process may run from a subdirectory (`SentinelWeb` -> `SentinelWeb/server`)
 *   - a process may run from a different root entirely (`SentinelArcuz100` is
 *     stored on the HDD but runs from `/home/kali/SentinelArcuz100/server`)
 */

/**
 * The PM2 name of the Hub's own process.
 *
 * Identical to `SELF_NAME` in `kali-bridge.py`, which is the enforcing side.
 * Everything above it is a courtesy check that produces a better error message
 * than a refused bridge call would.
 *
 * Read at call time rather than hoisted into a module constant: the value comes
 * from the environment, and a frozen constant would pin every deployment to
 * whatever the first import happened to see.
 */
export function hubProcessName(): string {
  const configured = (process.env.HUB_PM2_NAME ?? '').trim();
  return configured || 'sentinel-master';
}

/** Minimal shape of a PM2 process row, so this module needs no bridge import. */
export interface RuntimeProcess {
  name: string;
  status: string;
  cpu: number;
  memoryMb: number;
  restarts: number;
  uptimeMs: number | null;
  pid: number | null;
  cwd: string | null;
  script: string | null;
  /** Launch arguments, as PM2 reports them. Often carries the real project path. */
  args?: string[] | null;
}

export type ProjectRuntimeState = 'online' | 'stopped' | 'errored' | 'not-managed';

export interface ProjectRuntime {
  /** PM2 application name. */
  processName: string;
  /** Actual PM2 status. */
  state: ProjectRuntimeState;
  cpu: number;
  memoryMb: number;
  restarts: number;
  uptimeMs: number | null;
  pid: number | null;
  /** Directory PM2 launched the process from — the evidence behind the match. */
  cwd: string | null;
  script: string | null;
  /** Launch arguments, when they name the project directory. */
  args?: string[] | null;
}

/** Kali's mount point for the same source tree the Hub scans on Windows. */
const REMOTE_ROOT = '/home/kali/server';

/** Collapses a path to a comparable key: lower-case, forward slashes, no trailing slash. */
function pathKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Path split into components, empties dropped (`/mnt/x/y/` → `['mnt','x','y']`). */
function parts(value: string | null | undefined): string[] {
  return pathKey(value).split('/').filter(Boolean);
}

/** Final path component (`F:\INI KALI LA\Sentinel Master` → `sentinel master`). */
function baseKey(value: string): string {
  const list = parts(value);
  return list.length > 0 ? list[list.length - 1] : '';
}

/**
 * True when `candidate` is `root` itself or lives beneath it.
 *
 * Component-wise, so `/home/kali/server/SentinelWeb` does not match a sibling
 * directory called `/home/kali/server/SentinelWeb-old`.
 */
function isWithin(root: string, candidate: string): boolean {
  if (!root || !candidate) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function parseState(status: unknown): ProjectRuntimeState {
  const value = String(status ?? '').toLowerCase();
  if (value === 'online') return 'online';
  if (value === 'errored' || value === 'error') return 'errored';
  return 'stopped';
}

export function toRuntime(process: RuntimeProcess): ProjectRuntime {
  return {
    processName: process.name,
    state: parseState(process.status),
    cpu: process.cpu,
    memoryMb: process.memoryMb,
    restarts: process.restarts,
    uptimeMs: process.uptimeMs,
    pid: process.pid,
    cwd: process.cwd,
    script: process.script,
    args: Array.isArray(process.args) ? process.args : null,
  };
}

/** Ranks candidates so the most specific launch directory is used first. */
function bySpecificity(a: RuntimeProcess, b: RuntimeProcess): number {
  const depthDiff = parts(b.cwd).length - parts(a.cwd).length;
  if (depthDiff !== 0) return depthDiff;
  return String(a.name).localeCompare(String(b.name));
}

/** The single state a project tile shows for a project owning several processes. */
export function aggregateState(runtimes: ProjectRuntime[]): ProjectRuntimeState {
  if (runtimes.length === 0) return 'not-managed';
  if (runtimes.some((runtime) => runtime.state === 'errored')) return 'errored';
  if (runtimes.some((runtime) => runtime.state === 'online')) return 'online';
  return 'stopped';
}

/**
 * The absolute directory named by a process's launch arguments, if any.
 *
 * `sentinel-threat` is launched as
 * `bash -c "python3 -m http.server 8009 --directory /home/kali/server/SentinelThreat"`.
 * PM2 reports its cwd as `/home/kali`, so neither ancestry nor the directory
 * name can find it — the project path exists only inside the argument string.
 *
 * Deliberately conservative. Only absolute paths count, every segment must be an
 * ordinary filesystem name, and the caller still requires the result to be an
 * ancestor of a known project. A comma-joined list such as `--port 1,2,3` can
 * therefore never be mistaken for a directory.
 */
function argsProjectPath(process: RuntimeProcess): string | null {
  const joined = (process.args ?? []).join(' ');
  const match = joined.match(/(?:^|[\s"'=])(\/[A-Za-z0-9._/-]+)/);
  if (!match) return null;
  const candidate = pathKey(match[1]);
  const segments = parts(candidate);
  if (segments.length === 0) return null;
  if (segments.some((segment) => !/^[a-z0-9._-]+$/.test(segment))) return null;
  return candidate;
}

/**
 * Groups PM2 processes per project path.
 *
 * Three passes, deliberately ordered. The first matches on real path ancestry,
 * which is exact. The second falls back to comparing the project directory name
 * against any component of the launch directory, which is what bridges
 * `SentinelArcuz100` to `/home/kali/SentinelArcuz100/server` — a process
 * running outside both known mounts. The third reads the project path out of the
 * launch arguments, which is the only place `sentinel-threat` names it.
 *
 * Each fallback runs after the exact pass and only sees processes still
 * unclaimed. That ordering is the point: without it, a project whose directory
 * name happens to be a generic word (`server`, `web`) could steal a process that
 * already belongs to another project by exact path.
 *
 * A process is never assigned to more than one project.
 */
export function bindProjects(projectPaths: string[], processes: RuntimeProcess[]): Map<string, ProjectRuntime[]> {
  const result = new Map<string, ProjectRuntime[]>();
  const claimed = new Set<string>();

  const roots = projectPaths.map((projectPath) => ({
    projectPath,
    local: pathKey(projectPath),
    name: baseKey(projectPath),
    remote: pathKey(`${REMOTE_ROOT}/${baseKey(projectPath)}`),
  }));

  const assign = (projectPath: string, process: RuntimeProcess) => {
    const list = result.get(projectPath) ?? [];
    list.push(toRuntime(process));
    result.set(projectPath, list);
    claimed.add(process.name);
  };

  // Pass 1 — exact ancestry, on either mount.
  for (const root of roots) {
    if (!root.local) continue;
    const matches = processes
      .filter((process) => {
        const cwd = pathKey(process.cwd);
        return Boolean(cwd) && (isWithin(root.local, cwd) || isWithin(root.remote, cwd));
      })
      .sort(bySpecificity);
    for (const process of matches) assign(root.projectPath, process);
  }

  // Pass 2 — directory-name component, for processes running outside both mounts.
  for (const root of roots) {
    if (!root.name) continue;
    const matches = processes
      .filter((process) => !claimed.has(process.name) && parts(process.cwd).includes(root.name))
      .sort(bySpecificity);
    for (const process of matches) assign(root.projectPath, process);
  }

  // Pass 3 — project path named in the launch arguments. Only absolute paths
  // that are an ancestor of (or inside) a known project qualify, so a stray
  // absolute path in unrelated flags cannot bind a process to a project.
  // `candidate.local` must be non-empty: an empty project path would otherwise
  // derive a remote root of `/home/kali/server`, which is an ancestor of
  // everything stored on the HDD.
  for (const process of processes) {
    if (claimed.has(process.name)) continue;
    const fromArgs = argsProjectPath(process);
    if (!fromArgs) continue;
    const root = roots.find(
      (candidate) =>
        Boolean(candidate.local) &&
        (isWithin(candidate.local, fromArgs) || isWithin(candidate.remote, fromArgs)),
    );
    if (root) assign(root.projectPath, process);
  }

  return result;
}
