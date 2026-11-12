import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { ExecFailure, runGit, lines } from './exec';
import { getRuntimeMap, type ProjectRuntime } from './project-runtime';

/**
 * Project discovery for the local workspace root. Results are cached briefly so
 * a dashboard refresh does not spawn hundreds of git processes.
 */

export type ProjectKind = 'website' | 'bot' | 'service' | 'data' | 'library' | 'other';

export interface GitState {
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  remoteSlug: string | null;
  ahead: number;
  behind: number;
  changedFiles: number;
  lastCommit: { hash: string; subject: string; date: string } | null;
}

export interface ProjectSummary {
  name: string;
  path: string;
  kind: ProjectKind;
  framework: string | null;
  description: string | null;
  hasPackageJson: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  scripts: string[];
  hasReadme: boolean;
  hasEnvFile: boolean;
  entryHints: string[];
  totalBytes: number;
  modifiedAt: string;
  git: GitState;
  logoUrl?: string | null;
  /** Public or LAN web application URL for this project, if any. */
  webUrl?: string | null;
  /**
   * PM2 processes serving this project, most specific first. Empty when the
   * project has no supervised process. Derived from PM2's reported working
   * directory — see `project-runtime.ts` for why it is derived and not declared.
   */
  runtime?: ProjectRuntime[];
}

export interface ScanResult {
  root: string;
  rootExists: boolean;
  scannedAt: string;
  durationMs: number;
  projects: ProjectSummary[];
  totals: {
    projects: number;
    gitRepos: number;
    dirty: number;
    byKind: Record<ProjectKind, number>;
  };
}

const CACHE_TTL_MS = 45_000;
let cache: { at: number; value: ScanResult } | null = null;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  'lost+found',
  'docker',
  '9router-data',
  '9router-data_backup_pre_omni',
  'SentinelAI_Data',
  'SentinelAI_stale_old',
  'SentinelAI_stale_backup',
  'SentinelAI_archive_old_may2026',
  '.sentinel-state',
  // System and Linux home folders
  'Desktop',
  'Documents',
  'Downloads',
  'Music',
  'Pictures',
  'Public',
  'Templates',
  'Videos',
  'thinclient_drives',
  'go',
  'backend',
  'frontend',
  'server',
  'Projects',
  'sentinel_backup',
  'db-backups',
  'arcuz_backup_89704fd',
  'SentinelMaster', // alias symlink for Sentinel Master
]);

/** Buckets a project by inspecting its name, package metadata and entry files. */
export function classifyProject(input: {
  name: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
  entryHints: string[];
}): ProjectKind {
  const haystack = [
    input.name,
    ...input.entryHints,
    ...input.scripts,
    ...input.dependencies,
    ...input.devDependencies,
  ]
    .join(' ')
    .toLowerCase();

  if (/(^|[^a-z])(bot|automation|autobot|worker|cron|scheduler|scraper|selenium)([^a-z]|$)/.test(haystack)) {
    return 'bot';
  }
  if (/(sentineldata|votes?\.db|database|dataset|sqlite|migration|seed)/.test(haystack)) {
    return 'data';
  }
  if (/(next|react|vue|svelte|astro|vite|nuxt|tailwind|html|css|website|landing|dashboard)/.test(haystack)) {
    return 'website';
  }
  if (/(express|fastify|koa|hapi|nestjs|flask|fastapi|uvicorn|gunicorn|api-server|service)/.test(haystack)) {
    return 'service';
  }
  if (/(library|lib|sdk|types|utils|helpers|package)/.test(haystack)) return 'library';
  return 'other';
}

function detectFramework(deps: Record<string, string>): string | null {
  const checks: Array<[string, string]> = [
    ['next', 'Next.js'],
    ['nuxt', 'Nuxt'],
    ['@nestjs/core', 'NestJS'],
    ['astro', 'Astro'],
    ['svelte', 'Svelte'],
    ['vue', 'Vue'],
    ['@angular/core', 'Angular'],
    ['remix', 'Remix'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['react', 'React'],
    ['better-sqlite3', 'SQLite'],
  ];
  for (const [key, label] of checks) {
    if (deps[key]) return label;
  }
  return null;
}

function parseRemoteSlug(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const match = remoteUrl.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

async function readPackageJson(dir: string): Promise<{
  present: boolean;
  name?: string;
  description?: string;
  deps: Record<string, string>;
  scripts: string[];
}> {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) return { present: false, deps: {}, scripts: [] };
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    return {
      present: true,
      name: parsed.name,
      description: parsed.description,
      deps: { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) },
      scripts: Object.keys(parsed.scripts ?? {}),
    };
  } catch {
    return { present: false, deps: {}, scripts: [] };
  }
}

function parseAheadBehind(header: string): { ahead: number; behind: number } {
  const ahead = header.match(/ahead (\d+)/);
  const behind = header.match(/behind (\d+)/);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

async function readGitState(dir: string): Promise<GitState> {
  const empty: GitState = {
    isRepo: false,
    branch: null,
    remoteUrl: null,
    remoteSlug: null,
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    lastCommit: null,
  };
  if (!existsSync(path.join(dir, '.git'))) return empty;

  const state: GitState = { ...empty, isRepo: true };

  const statusResult = await runGit(['status', '--porcelain=v1', '--branch', '--untracked-files=normal'], dir)
    .then((r) => r.stdout)
    .catch((error: unknown) => (error instanceof ExecFailure ? error.result.stdout : ''));

  const statusLines = lines(statusResult);
  const header = statusLines.find((line) => line.startsWith('##'));
  if (header) {
    const branchPart = header.slice(2).trim();
    state.branch = branchPart.split(/\.\.\.|\s/)[0] ?? null;
    const ab = parseAheadBehind(branchPart);
    state.ahead = ab.ahead;
    state.behind = ab.behind;
    state.changedFiles = statusLines.filter((line) => !line.startsWith('##')).length;
  } else {
    state.changedFiles = statusLines.length;
  }

  const [remote, lastCommit] = await Promise.all([
    runGit(['config', '--get', 'remote.origin.url'], dir)
      .then((r) => r.stdout.trim() || null)
      .catch(() => null),
    runGit(['log', '-1', '--format=%H%x1f%s%x1f%cI'], dir)
      .then((r) => r.stdout.trim())
      .catch(() => ''),
  ]);

  state.remoteUrl = remote;
  state.remoteSlug = parseRemoteSlug(remote);
  if (lastCommit) {
    const [hash, subject, date] = lastCommit.split('\u001f');
    if (hash) state.lastCommit = { hash, subject: subject ?? '', date: date ?? '' };
  }

  if (!state.branch) {
    state.branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir)
      .then((r) => r.stdout.trim() || null)
      .catch(() => null);
  }

  return state;
}

/** Sums file sizes up to a fixed budget so a huge tree cannot stall the scan. */
async function measureSize(root: string, budgetMs = 400): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let total = 0;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    if (Date.now() > deadline) break;
    const current = queue.shift()!;
    let entries;
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (Date.now() > deadline) break;
      if (entry.isDirectory()) {
        if (current.depth >= 2 || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.git')) continue;
        queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      } else if (entry.isFile()) {
        try {
          total += (await stat(path.join(current.dir, entry.name))).size;
        } catch {
          // Ignore files that vanish mid-scan.
        }
      }
    }
  }
  return total;
}

function detectPackageManager(dir: string): 'npm' | 'pnpm' | 'yarn' | 'bun' | null {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  if (existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  return null;
}

function entryHints(dir: string): string[] {
  const candidates = [
    'requirements.txt',
    'pyproject.toml',
    'server.js',
    'index.js',
    'main.py',
    'app.py',
    'wranger.toml',
    'wrangler.toml',
    'docker-compose.yml',
    'Dockerfile',
  ];
  const found = candidates.filter((file) => existsSync(path.join(/*turbopackIgnore: true*/ dir, file)));
  if (existsSync(path.join(/*turbopackIgnore: true*/ dir, 'index.html'))) found.push('index.html');
  return found;
}

async function scanOne(name: string, dir: string): Promise<ProjectSummary | null> {
  let info;
  try {
    info = await stat(dir);
  } catch {
    return null;
  }
  if (!info.isDirectory()) return null;

  const [pkg, git, totalBytes] = await Promise.all([
    readPackageJson(dir),
    readGitState(dir),
    measureSize(dir),
  ]);

  const hints = entryHints(dir);
  const kind = classifyProject({
    name,
    dependencies: Object.keys(pkg.deps),
    devDependencies: [],
    scripts: pkg.scripts,
    entryHints: hints,
  });

  return {
    name,
    path: dir,
    kind,
    framework: detectFramework(pkg.deps),
    description: pkg.description ?? null,
    hasPackageJson: pkg.present,
    packageManager: detectPackageManager(dir),
    scripts: pkg.scripts,
    hasReadme: existsSync(path.join(dir, 'README.md')) || existsSync(path.join(dir, 'readme.md')),
    hasEnvFile: existsSync(path.join(dir, '.env')) || existsSync(path.join(dir, '.env.local')),
    entryHints: hints,
    totalBytes,
    modifiedAt: info.mtime.toISOString(),
    git,
    logoUrl: PROJECT_LOGO_MAP[name] ?? null,
    webUrl: resolveProjectWebUrl(name),
  };
}

export const PROJECT_URL_MAP: Record<string, string> = {
  'Sentinel Master': 'https://hub.sentinelai.studio',
  'SentinelMaster': 'https://hub.sentinelai.studio',
  'SentinelAI': 'https://sentinelai.studio',
  'Sentinel-CyberMaster': 'https://sentinelai.studio',
  '9router': 'https://router.sentinelai.studio',
  'SentinelAPI': 'https://api.sentinelai.studio',
  'SentinelArcuz100': 'https://arcuz.sentinelai.studio',
  'SentinelWeb': 'https://web.sentinelai.studio',
  'SentinelMLBB': 'https://mlbb.sentinelai.studio',
  'SentinelThreat': 'https://threat.sentinelai.studio',
  'SentinelFame': 'https://hall-of-fame.sentinelai.studio',
  'Sentinel-autobot': 'http://192.168.68.132:8025',
  'SentinelTouch': 'https://touch.sentinelai.studio',
  'SentinelView': 'https://view.sentinelai.studio',
  'SentinelConvert': 'https://convert.sentinelai.studio',
  'SentinelStory': 'https://story.sentinelai.studio',
  'SentinelFashion': 'https://fashion.sentinelai.studio',
  'SentinelMapping': 'https://mapping.sentinelai.studio',
  'SentinelHaq': 'https://haq.sentinelai.studio',
  'SentinelTruth': 'https://truth.sentinelai.studio',
  'SentinelTakaful': 'https://takaful.sentinelai.studio',
  'SentinelContract': 'https://contract.sentinelai.studio',
  'SentinelMesip': 'https://mesip.sentinelai.studio',
  'SentinelRFQ': 'https://rfq.sentinelai.studio',
  'SentinelPasti': 'https://pasti.sentinelai.studio',
  'SentinelTani': 'https://tani.sentinelai.studio',
  'SentinelCTF': 'https://ctf.sentinelai.studio',
  'SentinelNumber': 'https://number.sentinelai.studio',
  'SentinelCute': 'https://cute.sentinelai.studio',
  'SentinelYesNo': 'https://yesno.sentinelai.studio',
  'SentinelOS': 'https://os.sentinelai.studio',
  'SentinelTree': 'https://tree.sentinelai.studio',
};

export function resolveProjectWebUrl(name: string): string | null {
  if (PROJECT_URL_MAP[name]) return PROJECT_URL_MAP[name];
  const cleaned = name.replace(/^Sentinel[-_]?/i, '').toLowerCase();
  if (cleaned && cleaned !== name.toLowerCase()) {
    return `https://${cleaned}.sentinelai.studio`;
  }
  return null;
}

const PROJECT_LOGO_MAP: Record<string, string> = {
  'SentinelTruth': '/logos/logo_set1_09_analytics_truth_audit.png',
  'SentinelView': '/logos/logo_set2_02_ar_vr_vision.png',
  'SentinelTani': '/logos/logo_set1_03_eco_nature_agri.png',
  'SentinelTakaful': '/logos/logo_set1_04_blockchain_fintech.png',
  'SentinelContract': '/logos/logo_set1_04_blockchain_fintech.png',
  'hardhat-GelatinSmartContract': '/logos/logo_set1_04_blockchain_fintech.png',
  'SentinelConvert': '/logos/logo_set2_08_digital_twin_mapping.png',
  'SentinelMapping': '/logos/logo_set1_08_telecom_antenna.png',
  'SentinelOS': '/logos/logo_set2_10_smart_city_transport.png',
  'SentinelPasti': '/logos/logo_set2_09_ml_decision_tree_pasti.png',
  'SentinelYesNo': '/logos/logo_set2_09_ml_decision_tree_pasti.png',
  'SentinelCute': '/logos/logo_set1_06_quantum_physics.png',
  'SentinelRFQ': '/logos/logo_set1_01_civil_construction.png',
  'SentinelMesip': '/logos/logo_set2_07_3d_printing_fabrication.png',
  'SentinelHaq': '/logos/logo_set1_09_analytics_truth_audit.png',
  'SentinelWeb': '/logos/logo_set1_07_iot_smart_mesh.png',
  'SentinelTree': '/logos/logo_set2_04_biotech_dna_helix.png',
  'Sentinel Master': '/logos/logo_set1_02_ai_neural_brain.png',
  'SentinelAI': '/logos/logo_set1_02_ai_neural_brain.png',
  'SentinelAPI': '/logos/logo_set2_06_cloud_datacenter_servers.png',
  'SentinelArcuz100': '/logos/logo_set2_05_quantum_lattice_core.png',
  'Sentinel-CyberMaster': '/logos/logo_set1_10_cyber_shield_security.png',
  'SentinelCTF': '/logos/logo_set1_10_cyber_shield_security.png',
  'Sentinel-autobot': '/logos/logo_set2_01_robotics_automation.png',
  'SentinelMLBB': '/logos/logo_set1_05_space_satellite.png',
  'SentinelThreat': '/logos/logo_set1_10_cyber_shield_security.png',
  'SentinelData': '/logos/logo_set2_06_cloud_datacenter_servers.png',
  'Sentinel-Brand': '/logos/logo_set1_02_ai_neural_brain.png',
  'SentinelFame': '/logos/logo_set1_05_space_satellite.png',
  'SentinelFashion': '/logos/logo_set2_07_3d_printing_fabrication.png',
  'SentinelMonkeyType': '/logos/logo_set1_07_iot_smart_mesh.png',
  'SentinelNumber': '/logos/logo_set1_06_quantum_physics.png',
  'SentinelQuran': '/logos/logo_set1_03_eco_nature_agri.png',
  'SentinelQuranBot': '/logos/logo_set1_03_eco_nature_agri.png',
  'SentinelStory': '/logos/logo_set1_09_analytics_truth_audit.png',
  'SentinelTouch': '/logos/logo_set2_01_robotics_automation.png',
  'SentinelEuler': '/logos/logo_set2_09_ml_decision_tree_pasti.png',
  'TijarahMabrurLogo': '/logos/logo_set1_04_blockchain_fintech.png',
};

/** Runs `fn` over `items` with a bounded number of concurrent workers. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Scans the workspace root for project directories. */
export async function scanProjects(options: { force?: boolean } = {}): Promise<ScanResult> {
  if (!options.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const started = Date.now();
  const root = env.projectRoot;

  if (!existsSync(root)) {
    const value: ScanResult = {
      root,
      rootExists: false,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      projects: [],
      totals: { projects: 0, gitRepos: 0, dirty: 0, byKind: { website: 0, bot: 0, service: 0, data: 0, library: 0, other: 0 } },
    };
    cache = { at: Date.now(), value };
    return value;
  }

  const entries = await readdir(root, { withFileTypes: true });
  const rawDirs = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.name.startsWith('.') &&
          !SKIP_DIRS.has(entry.name) &&
          !entry.name.toLowerCase().includes('backup') &&
          !entry.name.startsWith('9router'),
      )
      .map(async (entry) => {
        const full = path.join(root, entry.name);
        try {
          const st = await stat(full);
          if (!st.isDirectory()) return null;
          // Valid project: starts with Sentinel or contains package/git/script hints
          const isSentinel = entry.name.toLowerCase().startsWith('sentinel') || entry.name === 'FMS';
          const hasIndicators =
            existsSync(path.join(full, 'package.json')) ||
            existsSync(path.join(full, '.git')) ||
            existsSync(path.join(full, 'requirements.txt')) ||
            existsSync(path.join(full, 'pyproject.toml')) ||
            existsSync(path.join(full, 'index.html'));
          if (isSentinel || hasIndicators) {
            return { name: entry.name, dir: full };
          }
          return null;
        } catch {
          return null;
        }
      }),
  );
  const dirs = rawDirs.filter((item): item is { name: string; dir: string } => item !== null);

  const scanned = await mapLimited(dirs, 6, ({ name, dir }) => scanOne(name, dir));
  const projects = scanned.filter((item): item is ProjectSummary => item !== null);

  projects.sort((a, b) => {
    if (a.git.changedFiles !== b.git.changedFiles) return b.git.changedFiles - a.git.changedFiles;
    return a.name.localeCompare(b.name);
  });

  const byKind: Record<ProjectKind, number> = { website: 0, bot: 0, service: 0, data: 0, library: 0, other: 0 };
  for (const project of projects) byKind[project.kind] += 1;

  const value: ScanResult = {
    root,
    rootExists: true,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    projects,
    totals: {
      projects: projects.length,
      gitRepos: projects.filter((p) => p.git.isRepo).length,
      dirty: projects.filter((p) => p.git.changedFiles > 0).length,
      byKind,
    },
  };
  cache = { at: Date.now(), value };
  return value;
}

/**
 * The scan plus the live binding of each project to its PM2 processes.
 *
 * Kept out of `scanProjects` on purpose. The scan is cached for 45 seconds
 * because it shells out to git for dozens of directories; PM2 state is volatile
 * and changes the instant an action completes. Binding inside the cached value
 * meant that after a restart the API kept serving the *pre-restart* uptime and
 * restart count for up to 45 seconds, so the operator could not tell whether
 * their action had worked.
 *
 * A failed bridge call leaves every project unbound rather than failing the
 * whole scan.
 */
export async function scanProjectsWithRuntime(options: { force?: boolean } = {}): Promise<ScanResult> {
  const result = await scanProjects(options);
  const runtimes = await getRuntimeMap(result.projects.map((project) => project.path));
  return {
    ...result,
    projects: result.projects.map((project) => ({
      ...project,
      runtime: runtimes.get(project.path) ?? [],
      webUrl: project.webUrl ?? resolveProjectWebUrl(project.name),
    })),
  };
}

/** Drops the cached scan. The runtime binding is never cached, so it needs no invalidation. */
export function invalidateProjectCache(): void {
  cache = null;
}

/**
 * Resolves a project by name. Only directories that exist directly under the
 * workspace root are accepted, which prevents traversal via `..` or separators.
 */
export async function resolveProject(name: string): Promise<{ name: string; path: string } | null> {
  if (!name || name !== path.basename(name) || name.includes('..') || /[\\/]/.test(name)) return null;
  const candidate = path.join(env.projectRoot, name);
  const resolvedRoot = path.resolve(env.projectRoot);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(resolvedRoot + path.sep)) return null;
  try {
    const info = await stat(resolved);
    return info.isDirectory() ? { name, path: resolved } : null;
  } catch {
    return null;
  }
}
