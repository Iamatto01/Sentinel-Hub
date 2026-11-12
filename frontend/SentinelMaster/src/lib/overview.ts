import { env, requirementStatuses, type RequirementStatus } from './env';
import { scanProjects, type ScanResult } from './projects';
import { attempt } from './http';
import { getFameSnapshot, getAutobotSnapshot, describeFameError } from './fame';
import { getStatus as getKaliStatus, kaliConfigured, describeKaliError, type KaliStatus } from './kali';
import { getAuthenticatedUser, getTokenScopes, listRepos, describeGithubError, type GithubRepo, type GithubUser } from './github';
import { getStatus as getGitStatus } from './git';
import { dbConfigured, discover as discoverDatabases, type DbDiscovery } from './db';

/**
 * Single aggregation point for the Overview dashboard.
 *
 * Every upstream is independent, so one being down must not blank the page —
 * each section resolves to either its value or an explicit degraded state.
 */

export interface SectionResult<T> {
  state: 'ok' | 'degraded' | 'unconfigured';
  data: T | null;
  error?: string;
}

export interface GithubOverview {
  user: GithubUser;
  scopes: string[];
  repos: GithubRepo[];
}

export interface OverviewPayload {
  generatedAt: string;
  requirements: RequirementStatus[];
  totals: {
    projects: number;
    gitRepos: number;
    dirtyRepos: number;
    notPushed: number;
    githubRepos: number;
    pendingPayments: number;
    completedPayments: number;
    revenue: number;
    kaliOnline: number;
    kaliWebsites: number;
    kaliBots: number;
    databases: number;
    divergedDatabases: number;
  };
  projects: ScanResult;
  github: SectionResult<GithubOverview>;
  fame: SectionResult<{
    pendingCount: number;
    completedCount: number;
    revenue: number;
    currency: string;
    latestCompletedAt: string | null;
    pendingOldestMinutes: number | null;
    queue: unknown[];
  }>;
  autobot: SectionResult<unknown>;
  kali: SectionResult<KaliStatus>;
  databases: SectionResult<DbDiscovery>;
  worklist: WorkItem[];
}

export interface WorkItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  area: 'hub' | 'projects' | 'github' | 'fame' | 'autobot' | 'kali' | 'databases';
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

/** Builds the prioritised "what needs attention" list. */
export function buildWorklist(input: {
  projects: ScanResult;
  github: SectionResult<GithubOverview>;
  fame: SectionResult<OverviewPayload['fame']['data']>;
  autobot: SectionResult<unknown>;
  kali: SectionResult<KaliStatus>;
  databases: SectionResult<DbDiscovery>;
  requirements: RequirementStatus[];
}): WorkItem[] {
  const items: WorkItem[] = [];

  /*
   * Database drift comes first, ahead of an unconfigured token. Jack's report
   * was "the project database always gets altered" — a diverged copy is live
   * data corruption, and it outranks every cosmetic gap on this list.
   */
  const databases = input.databases.data;
  if (databases) {
    for (const group of databases.duplicateGroups) {
      if (!group.diverged) continue;
      const spread = Array.from(new Set(group.tableCounts.map((count) => (count < 0 ? '?' : count))));
      items.push({
        id: `database-diverged-${group.filename}`,
        severity: 'critical',
        area: 'databases',
        title: `${group.filename} has ${group.copies} copies that no longer match`,
        detail: `Table counts ${spread.join(' vs ')}. Only one copy can be the live one — compare them before trusting either.`,
        action: { label: 'Compare copies', href: `/databases?compare=${encodeURIComponent(group.filename)}` },
      });
    }

    /*
     * The decisive question for a diverged group is not "which file is bigger"
     * but "which copy is the running service actually holding open". If the
     * live copy is not the richest one, a service is serving stale data.
     */
    const byPath = new Map(databases.managed.map((entry) => [entry.path, entry]));
    for (const group of databases.duplicateGroups) {
      if (!group.diverged) continue;
      const copies = group.paths.map((path) => byPath.get(path)).filter((entry) => entry !== undefined);
      const liveCopy = copies.find((entry) => entry.live);
      if (!liveCopy) continue;
      const richest = copies.reduce(
        (best, entry) => ((entry.tableCount ?? -1) > (best.tableCount ?? -1) ? entry : best),
        copies[0]!,
      );
      if ((liveCopy.tableCount ?? -1) < (richest.tableCount ?? -1)) {
        items.push({
          id: `database-stale-live-${group.filename}`,
          severity: 'critical',
          area: 'databases',
          title: `${group.filename}: the live copy has fewer tables than an idle copy`,
          detail: `A running process holds ${liveCopy.path} (${liveCopy.tableCount} tables) while ${richest.path} has ${richest.tableCount}. The service is likely reading a stale database.`,
          action: { label: 'Inspect live copy', href: `/databases?db=${liveCopy.id}` },
        });
      }
    }

    for (const group of databases.duplicateGroups) {
      if (!group.diverged) continue;
      const live = group.paths.filter((path) => byPath.get(path)?.live);
      if (live.length === 0) continue;
      items.push({
        id: `database-ambiguity-${group.filename}`,
        severity: 'warning',
        area: 'databases',
        title: `${group.filename} is diverged and still open by a process`,
        detail: `${live.join(', ')} is held open while other copies exist. Verify which path the service resolves before archiving anything.`,
        action: { label: 'Compare copies', href: `/databases?compare=${encodeURIComponent(group.filename)}` },
      });
    }

    if (databases.divergedCount > 0) {
      items.push({
        id: 'databases-diverged-summary',
        severity: 'warning',
        area: 'databases',
        title: `${databases.divergedCount} duplicated database file(s) have drifted apart`,
        detail: `${databases.total} file(s) scanned, ${databases.managedCount} managed. Drift means two processes are writing different files with the same name.`,
        action: { label: 'Open databases', href: '/databases' },
      });
    }
  }

  for (const requirement of input.requirements) {
    if (requirement.configured) continue;
    const critical = requirement.key === 'dashboardPassword' || requirement.key === 'sessionSecret';
    items.push({
      id: `requirement-${requirement.key}`,
      severity: critical ? 'critical' : 'warning',
      area: 'hub',
      title: `${requirement.label} is not configured`,
      detail: requirement.detail,
      action: { label: 'Open settings', href: '/settings' },
    });
  }

  const pending = input.fame.data?.pendingCount ?? 0;
  if (pending > 0) {
    const oldest = input.fame.data?.pendingOldestMinutes ?? null;
    items.push({
      id: 'fame-pending',
      severity: pending >= 10 ? 'warning' : 'info',
      area: 'fame',
      title: `${pending} payment${pending === 1 ? '' : 's'} awaiting approval`,
      detail:
        oldest === null
          ? 'Open the SentinelFame dashboard to review the queue.'
          : `Oldest pending entry is about ${Math.round(oldest)} minute(s) old.`,
      action: { label: 'Review queue', href: '/fame' },
    });
  }

  const dirty = input.projects.projects.filter((project) => project.git.isRepo && project.git.changedFiles > 0);
  if (dirty.length > 0) {
    items.push({
      id: 'projects-dirty',
      severity: 'info',
      area: 'projects',
      title: `${dirty.length} project${dirty.length === 1 ? '' : 's'} with uncommitted changes`,
      detail: dirty
        .slice(0, 6)
        .map((project) => `${project.name} (${project.git.changedFiles})`)
        .join(', '),
      action: { label: 'Open projects', href: '/projects' },
    });
  }

  const untracked = input.projects.projects.filter((project) => !project.git.isRepo);
  if (untracked.length > 0) {
    items.push({
      id: 'projects-no-git',
      severity: 'info',
      area: 'projects',
      title: `${untracked.length} project${untracked.length === 1 ? '' : 's'} not under Git yet`,
      detail: 'Initialize a repository and push them to GitHub from the Projects dashboard.',
      action: { label: 'Initialize Git', href: '/projects' },
    });
  }

  const nokali = input.kali.state;
  if (nokali === 'degraded') {
    items.push({
      id: 'kali-unreachable',
      severity: 'warning',
      area: 'kali',
      title: 'Kali server is unreachable',
      detail: input.kali.error ?? 'The SSH bridge could not connect.',
      action: { label: 'Open Kali', href: '/kali' },
    });
  }

  const errored = input.kali.data?.pm2.filter((process) => process.status !== 'online') ?? [];
  for (const process of errored.slice(0, 8)) {
    if (process.status === 'stopped') continue;
    items.push({
      id: `kali-pm2-${process.name}`,
      severity: 'warning',
      area: 'kali',
      title: `${process.name} is ${process.status} on Kali`,
      detail: `${process.restarts} restart(s), ${process.memoryMb.toFixed(1)} MB`,
      action: { label: 'Inspect process', href: '/kali' },
    });
  }

  const stopped = input.kali.data?.pm2.filter((process) => process.status === 'stopped') ?? [];
  if (stopped.length > 0) {
    items.push({
      id: 'kali-stopped',
      severity: 'info',
      area: 'kali',
      title: `${stopped.length} stopped service${stopped.length === 1 ? '' : 's'} on Kali`,
      detail: stopped.map((process) => process.name).join(', '),
      action: { label: 'Open Kali', href: '/kali' },
    });
  }

  if (input.autobot.state === 'degraded') {
    items.push({
      id: 'autobot-unreachable',
      severity: 'info',
      area: 'autobot',
      title: 'SentinelFame Autobot API is not responding',
      detail: input.autobot.error ?? 'Check that the bot process is running.',
      action: { label: 'Open Autobot', href: '/autobot' },
    });
  }

  if (input.github.state === 'degraded') {
    items.push({
      id: 'github-degraded',
      severity: 'warning',
      area: 'github',
      title: 'GitHub integration is not available',
      detail: input.github.error ?? 'Set GITHUB_TOKEN to enable repository management.',
      action: { label: 'Open GitHub', href: '/github' },
    });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity] || a.area.localeCompare(b.area));
}

export async function buildOverview(): Promise<OverviewPayload> {
  const projects = await scanProjects();

  const [githubResult, fameResult, autobotResult, kaliResult, databaseResult] = await Promise.all([
    loadGithub(),
    loadFame(),
    loadAutobot(),
    loadKali(),
    loadDatabases(),
  ]);

  const requirements = requirementStatuses();

  const totals = {
    projects: projects.totals.projects,
    gitRepos: projects.totals.gitRepos,
    dirtyRepos: projects.projects.filter((project) => project.git.isRepo && project.git.changedFiles > 0).length,
    notPushed: projects.projects.filter(
      (project) => project.git.isRepo && (!project.git.remoteSlug || project.git.ahead > 0),
    ).length,
    githubRepos: githubResult.data?.repos.length ?? 0,
    pendingPayments: fameResult.data?.pendingCount ?? 0,
    completedPayments: fameResult.data?.completedCount ?? 0,
    revenue: fameResult.data?.revenue ?? 0,
    kaliOnline: kaliResult.data?.pm2Summary.online ?? 0,
    kaliWebsites: kaliResult.data?.pm2Summary.byType.website ?? 0,
    kaliBots: kaliResult.data?.pm2Summary.byType.bot ?? 0,
    databases: databaseResult.data?.managedCount ?? 0,
    divergedDatabases: databaseResult.data?.divergedCount ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    requirements,
    totals,
    projects,
    github: githubResult,
    fame: fameResult,
    autobot: autobotResult,
    kali: kaliResult,
    databases: databaseResult,
    worklist: buildWorklist({
      projects,
      github: githubResult,
      fame: fameResult,
      autobot: autobotResult,
      kali: kaliResult,
      databases: databaseResult,
      requirements,
    }),
  };
}

async function loadGithub(): Promise<SectionResult<GithubOverview>> {
  if (!env.github.token) {
    return { state: 'unconfigured', data: null, error: 'GITHUB_TOKEN is not configured' };
  }
  const result = await attempt(
    (async () => {
      const [user, scopes, repos] = await Promise.all([getAuthenticatedUser(), getTokenScopes(), listRepos({ perPage: 100 })]);
      return { user, scopes, repos } satisfies GithubOverview;
    })(),
  );
  if (result.ok) return { state: 'ok', data: result.value };
  return { state: 'degraded', data: null, error: describeGithubError(new Error(result.error)).message };
}

async function loadFame(): Promise<SectionResult<NonNullable<OverviewPayload['fame']['data']>>> {
  if (!env.fame.adminKey) {
    return { state: 'unconfigured', data: null, error: 'FAME_ADMIN_KEY is not configured' };
  }
  const result = await attempt(getFameSnapshot({ paymentLimit: 12 }));
  if (!result.ok) {
    return { state: 'degraded', data: null, error: describeFameError(new Error(result.error)).message };
  }
  const snapshot = result.value;
  const pendingAges = snapshot.pending
    .map((payment) => payment.ageMinutes)
    .filter((age): age is number => age !== null && Number.isFinite(age));

  return {
    state: 'ok',
    data: {
      pendingCount: snapshot.stats.pendingCount,
      completedCount: snapshot.stats.completedCount,
      revenue: snapshot.stats.revenue,
      currency: snapshot.stats.currency,
      latestCompletedAt: snapshot.recentCompleted[0]?.createdAt ?? null,
      pendingOldestMinutes: pendingAges.length > 0 ? Math.max(...pendingAges) : null,
      queue: snapshot.pending.slice(0, 8),
    },
  };
}

async function loadAutobot(): Promise<SectionResult<unknown>> {
  if (!env.autobot.baseUrl) {
    return { state: 'unconfigured', data: null, error: 'AUTOBOT_BASE_URL is not configured' };
  }
  const result = await attempt(getAutobotSnapshot());
  if (!result.ok) return { state: 'degraded', data: null, error: result.error };
  if (!result.value.reachable) return { state: 'degraded', data: result.value, error: result.value.error };
  return { state: 'ok', data: result.value };
}

async function loadKali(): Promise<SectionResult<KaliStatus>> {
  const gate = kaliConfigured();
  if (!gate.ok) return { state: 'unconfigured', data: null, error: gate.reason };
  const result = await attempt(getKaliStatus());
  if (!result.ok) return { state: 'degraded', data: null, error: describeKaliError(new Error(result.error)).message };
  return { state: 'ok', data: result.value };
}

async function loadDatabases(): Promise<SectionResult<DbDiscovery>> {
  const gate = dbConfigured();
  if (!gate.ok) return { state: 'unconfigured', data: null, error: gate.reason };
  const result = await attempt(discoverDatabases());
  if (!result.ok) {
    if (result.error.includes('not configured')) {
      return { state: 'unconfigured', data: null, error: result.error };
    }
    return { state: 'degraded', data: null, error: result.error };
  }
  return { state: 'ok', data: result.value };
}

/** Home directory of the workspace root, used by the Settings screen. */
export async function hubDiagnostics(): Promise<{
  hubDir: string;
  projectRoot: string;
  node: string;
  platform: string;
  uptimeSeconds: number;
}> {
  return {
    hubDir: env.hubDir,
    projectRoot: env.projectRoot,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export { getGitStatus };
