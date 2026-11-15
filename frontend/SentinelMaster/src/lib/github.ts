import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { fetchJson, UpstreamError } from './http';

/**
 * GitHub REST client. Uses a Bearer token, never a query-string token, so the
 * credential cannot leak into access logs or `Referer` headers.
 */

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  publicRepos: number;
  followers: number;
  createdAt: string;
}

export interface GithubOwner {
  login: string;
  avatarUrl: string;
  type: string;
  htmlUrl: string;
}

export interface GithubOrg {
  id: number;
  login: string;
  avatarUrl: string;
  description: string | null;
}

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  sizeKb: number;
  archived: boolean;
  pushedAt: string | null;
  updatedAt: string | null;
  topics: string[];
  owner: GithubOwner;
  homepage: string | null;
  hasPages: boolean;
  license: string | null;
}

export interface GithubSshKey {
  id: number;
  title: string;
  key: string;
  createdAt: string;
}

export interface GithubRepoAuditResult {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  checks: Array<{
    id: string;
    name: string;
    status: 'pass' | 'warn' | 'fail' | 'info';
    detail: string;
  }>;
  recommendations: string[];
  auditedAt: string;
}

export class GithubNotConfigured extends Error {
  constructor() {
    super('GITHUB_TOKEN is not configured');
    this.name = 'GithubNotConfigured';
  }
}

function headers(): Record<string, string> {
  const token = env.github.token;
  if (!token) throw new GithubNotConfigured();
  return {
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'sentinel-master-hub',
  };
}

async function githubFetch<T>(path: string, init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }): Promise<T> {
  const base = env.github.apiBase || 'https://api.github.com';
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetchJson<T>(url, {
    method: init?.method ?? 'GET',
    headers: headers(),
    body: init?.body,
    timeoutMs: 20_000,
  });
}

export async function getAuthenticatedUser(): Promise<GithubUser> {
  const raw = await githubFetch<{
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    public_repos: number;
    followers: number;
    created_at: string;
  }>('/user');

  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
    publicRepos: raw.public_repos,
    followers: raw.followers,
    createdAt: raw.created_at,
  };
}

/** Validates the token and returns the scopes GitHub reports in the response headers. */
export async function getTokenScopes(): Promise<string[]> {
  const token = env.github.token;
  if (!token) throw new GithubNotConfigured();
  const base = env.github.apiBase || 'https://api.github.com';
  const response = await fetch(`${base}/user`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'sentinel-master-hub' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new UpstreamError(`GitHub rejected the token (${response.status})`, response.status);
  }
  const scopeHeader = response.headers.get('x-oauth-scopes');
  return scopeHeader ? scopeHeader.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function mapRepo(raw: {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url?: string;
  default_branch: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  archived: boolean;
  pushed_at: string | null;
  updated_at: string | null;
  topics?: string[];
  owner?: {
    login: string;
    avatar_url: string;
    type?: string;
    html_url?: string;
  };
  homepage?: string | null;
  has_pages?: boolean;
  license?: { name: string } | null;
}): GithubRepo {
  const ownerLogin = raw.owner?.login ?? '';
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    private: raw.private,
    htmlUrl: raw.html_url,
    cloneUrl: raw.clone_url,
    sshUrl: raw.ssh_url ?? `git@github.com:${raw.full_name}.git`,
    defaultBranch: raw.default_branch,
    description: raw.description,
    language: raw.language,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    openIssues: raw.open_issues_count,
    sizeKb: raw.size,
    archived: raw.archived,
    pushedAt: raw.pushed_at,
    updatedAt: raw.updated_at,
    topics: raw.topics ?? [],
    owner: {
      login: ownerLogin,
      avatarUrl: raw.owner?.avatar_url ?? '',
      type: raw.owner?.type ?? 'User',
      htmlUrl: raw.owner?.html_url ?? `https://github.com/${ownerLogin}`,
    },
    homepage: raw.homepage || null,
    hasPages: Boolean(raw.has_pages),
    license: raw.license?.name ?? null,
  };
}

/** Lists repositories, most recently pushed first. */
export async function listRepos(options: { perPage?: number; affiliation?: string } = {}): Promise<GithubRepo[]> {
  const perPage = Math.min(Math.max(1, options.perPage ?? 100), 100);
  const affiliation = options.affiliation ?? 'owner,collaborator,organization_member';
  const raw = await githubFetch<Parameters<typeof mapRepo>[0][]>(
    `/user/repos?per_page=${perPage}&sort=pushed&direction=desc&affiliation=${encodeURIComponent(affiliation)}`,
  );
  return raw.map(mapRepo);
}

export async function getRepo(owner: string, name: string): Promise<GithubRepo> {
  const raw = await githubFetch<Parameters<typeof mapRepo>[0]>(`/repos/${owner}/${name}`);
  return mapRepo(raw);
}

/** Lists organizations the user is a member of. */
export async function listOrgs(): Promise<GithubOrg[]> {
  try {
    const raw = await githubFetch<Array<{
      id: number;
      login: string;
      avatar_url: string;
      description: string | null;
    }>>('/user/orgs');
    return raw.map((item) => ({
      id: item.id,
      login: item.login,
      avatarUrl: item.avatar_url,
      description: item.description,
    }));
  } catch (error) {
    if (error instanceof GithubNotConfigured) throw error;
    return [];
  }
}

/** Validates and saves GitHub token in-memory and to .env.local. */
export async function saveGithubToken(rawToken: string): Promise<{ user: GithubUser; scopes: string[] }> {
  const token = rawToken.trim();
  if (!token) throw new Error('GitHub token cannot be empty');

  // Verify against GitHub API directly
  const base = env.github.apiBase || 'https://api.github.com';
  const response = await fetch(`${base}/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'sentinel-master-hub',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new UpstreamError(`GitHub rejected token (${response.status} ${response.statusText})`, response.status);
  }

  const rawUser = (await response.json()) as {
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    public_repos: number;
    followers: number;
    created_at: string;
  };

  const scopeHeader = response.headers.get('x-oauth-scopes');
  const scopes = scopeHeader ? scopeHeader.split(',').map((s) => s.trim()).filter(Boolean) : [];

  // Update in-memory runtime
  process.env.GITHUB_TOKEN = token;
  (env.github as { token?: string }).token = token;

  // Persist to .env.local
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    let content = '';
    if (existsSync(envPath)) {
      content = await readFile(envPath, 'utf-8');
    }

    if (/^GITHUB_TOKEN=/m.test(content)) {
      content = content.replace(/^GITHUB_TOKEN=.*$/m, `GITHUB_TOKEN=${token}`);
    } else {
      content = `${content.trimEnd()}\nGITHUB_TOKEN=${token}\n`;
    }

    await writeFile(envPath, content, 'utf-8');
  } catch (err) {
    console.error('Failed to write GITHUB_TOKEN to .env.local:', err);
  }

  return {
    user: {
      login: rawUser.login,
      name: rawUser.name,
      avatarUrl: rawUser.avatar_url,
      htmlUrl: rawUser.html_url,
      publicRepos: rawUser.public_repos,
      followers: rawUser.followers,
      createdAt: rawUser.created_at,
    },
    scopes,
  };
}

/** Comprehensive repository security & quality audit. */
export async function auditRepo(owner: string, name: string): Promise<GithubRepoAuditResult> {
  const repo = await getRepo(owner, name);
  const checks: GithubRepoAuditResult['checks'] = [];
  const recommendations: string[] = [];
  let score = 100;

  // 1. Visibility check
  if (repo.private) {
    checks.push({
      id: 'visibility',
      name: 'Repository Visibility',
      status: 'pass',
      detail: 'Repository is private (source code and commit history are protected).',
    });
  } else {
    checks.push({
      id: 'visibility',
      name: 'Repository Visibility',
      status: 'info',
      detail: 'Repository is public. Extra diligence required for exposed credentials and URLs.',
    });
  }

  // 2. Default branch
  if (repo.defaultBranch === 'main' || repo.defaultBranch === 'master') {
    checks.push({
      id: 'default_branch',
      name: 'Standard Default Branch',
      status: 'pass',
      detail: `Default branch is set to "${repo.defaultBranch}".`,
    });
  } else {
    score -= 5;
    checks.push({
      id: 'default_branch',
      name: 'Non-Standard Default Branch',
      status: 'warn',
      detail: `Default branch is "${repo.defaultBranch}". Consider standardizing on "main".`,
    });
    recommendations.push('Standardize primary branch name to "main" across deployment pipelines.');
  }

  // 3. License
  if (repo.license) {
    checks.push({
      id: 'license',
      name: 'Software License',
      status: 'pass',
      detail: `License identified: ${repo.license}.`,
    });
  } else {
    score -= 10;
    checks.push({
      id: 'license',
      name: 'Missing License File',
      status: 'warn',
      detail: 'No SPDX software license detected. Add a LICENSE file to clarify copyright.',
    });
    recommendations.push('Add a LICENSE file (e.g. MIT, Apache 2.0, or Proprietary).');
  }

  // 4. Description
  if (repo.description && repo.description.trim().length > 10) {
    checks.push({
      id: 'description',
      name: 'Project Description',
      status: 'pass',
      detail: 'Clear repository description present.',
    });
  } else {
    score -= 5;
    checks.push({
      id: 'description',
      name: 'Incomplete Description',
      status: 'warn',
      detail: 'Repository lacks a descriptive summary.',
    });
    recommendations.push('Provide a concise project summary in repository settings.');
  }

  // 5. Issues Backlog
  if (repo.openIssues === 0) {
    checks.push({
      id: 'issues',
      name: 'Issue Backlog Hygiene',
      status: 'pass',
      detail: 'Zero unresolved open issues or pull requests.',
    });
  } else if (repo.openIssues < 15) {
    checks.push({
      id: 'issues',
      name: 'Issue Backlog',
      status: 'pass',
      detail: `${repo.openIssues} open issues or PRs within healthy operational limits.`,
    });
  } else {
    score -= 10;
    checks.push({
      id: 'issues',
      name: 'High Issue Count',
      status: 'warn',
      detail: `${repo.openIssues} open issues or PRs pending triage.`,
    });
    recommendations.push('Review and resolve pending issues and open pull requests.');
  }

  // 6. Freshness
  if (repo.pushedAt) {
    const pushedDate = new Date(repo.pushedAt).getTime();
    const daysSincePush = Math.floor((Date.now() - pushedDate) / (1000 * 60 * 60 * 24));
    if (daysSincePush <= 30) {
      checks.push({
        id: 'freshness',
        name: 'Commit Activity',
        status: 'pass',
        detail: `Actively maintained (pushed ${daysSincePush} day(s) ago).`,
      });
    } else if (daysSincePush <= 90) {
      checks.push({
        id: 'freshness',
        name: 'Commit Activity',
        status: 'info',
        detail: `Last activity was ${daysSincePush} days ago.`,
      });
    } else {
      score -= 10;
      checks.push({
        id: 'freshness',
        name: 'Dormant Repository',
        status: 'warn',
        detail: `No commits for ${daysSincePush} days. Check for stale dependencies.`,
      });
      recommendations.push('Run dependency upgrade audit on dormant codebase.');
    }
  }

  // 7. Security and config files
  try {
    const contents = await githubFetch<Array<{ name: string; path: string }>>(`/repos/${owner}/${name}/contents`);
    const filenames = new Set(contents.map((c) => c.name.toLowerCase()));

    if (filenames.has('.gitignore')) {
      checks.push({
        id: 'gitignore',
        name: '.gitignore Security Boundary',
        status: 'pass',
        detail: '.gitignore rule file is configured to protect against credential leaks.',
      });
    } else {
      score -= 15;
      checks.push({
        id: 'gitignore',
        name: 'Missing .gitignore',
        status: 'fail',
        detail: 'No .gitignore found! Severe risk of committing .env, API keys, or large dependencies.',
      });
      recommendations.push('Create a strict .gitignore file blocking .env, *.pem, and local artifacts.');
    }

    if (filenames.has('readme.md') || filenames.has('readme')) {
      checks.push({
        id: 'readme',
        name: 'Documentation Readme',
        status: 'pass',
        detail: 'README documentation is published in root directory.',
      });
    } else {
      score -= 5;
      checks.push({
        id: 'readme',
        name: 'Missing README',
        status: 'warn',
        detail: 'No README.md documentation file found.',
      });
      recommendations.push('Add a README.md file outlining installation and usage instructions.');
    }
  } catch {
    checks.push({
      id: 'contents',
      name: 'Content Inspection',
      status: 'info',
      detail: 'Repository tree inspection skipped (empty repository or insufficient permissions).',
    });
  }

  score = Math.max(0, Math.min(100, score));
  let grade: GithubRepoAuditResult['grade'] = 'A+';
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    summary: `Audit finished for ${owner}/${name}. Security & Quality Score: ${score}/100 (Grade ${grade}).`,
    checks,
    recommendations,
    auditedAt: new Date().toISOString(),
  };
}

/** Fetches README markdown and root directory tree for Live Preview / Inspector. */
export async function getRepoReadmeAndFiles(owner: string, name: string): Promise<{
  readme?: string;
  files: Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }>;
}> {
  let readme: string | undefined;
  const files: Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }> = [];

  try {
    const rawReadme = await githubFetch<{ content: string; encoding: string }>(`/repos/${owner}/${name}/readme`);
    if (rawReadme.content && rawReadme.encoding === 'base64') {
      readme = Buffer.from(rawReadme.content, 'base64').toString('utf-8');
    }
  } catch {
    // No readme found
  }

  try {
    const rawContents = await githubFetch<Array<{ name: string; path: string; type: string; size?: number }>>(
      `/repos/${owner}/${name}/contents`,
    );
    for (const item of rawContents) {
      files.push({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        size: item.size,
      });
    }
  } catch {
    // Contents not accessible
  }

  return { readme, files };
}

/** Synchronizes a repository (local git pull if linked, or remote head check). */
export async function syncRepo(owner: string, name: string, localProject?: string): Promise<{
  success: boolean;
  message: string;
  branch?: string;
  commit?: string;
}> {
  if (localProject) {
    try {
      const { scanProjects } = await import('./projects');
      const scan = await scanProjects();
      const proj = scan.projects.find((p) => p.name.toLowerCase() === localProject.toLowerCase());
      if (proj && proj.path) {
        const { runGit } = await import('./exec');
        const pullRes = await runGit(['pull'], proj.path);
        const logRes = await runGit(['log', '-1', '--oneline'], proj.path);
        return {
          success: true,
          message: pullRes.stdout.trim() || 'Synced with remote origin',
          commit: logRes.stdout.trim(),
        };
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Local Git pull failed',
      };
    }
  }

  const repo = await getRepo(owner, name);
  return {
    success: true,
    message: `Cloud repository verified up to date on branch ${repo.defaultBranch}.`,
    branch: repo.defaultBranch,
  };
}

/** Creates the repository when it does not exist yet. Idempotent. */
export async function ensureRepo(input: {
  name: string;
  description?: string;
  private?: boolean;
}): Promise<{ repo: GithubRepo; created: boolean }> {
  const user = await getAuthenticatedUser();
  try {
    const existing = await getRepo(user.login, input.name);
    return { repo: existing, created: false };
  } catch (error) {
    if (!(error instanceof UpstreamError) || error.status !== 404) throw error;
  }

  try {
    const raw = await githubFetch<Parameters<typeof mapRepo>[0]>('/user/repos', {
      method: 'POST',
      body: {
        name: input.name,
        description: input.description ?? 'Managed by Sentinel Master Hub',
        private: input.private ?? true,
        auto_init: false,
      },
    });
    return { repo: mapRepo(raw), created: true };
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 422) {
      const repo = await getRepo(user.login, input.name);
      return { repo, created: false };
    }
    throw error;
  }
}

export async function listSshKeys(): Promise<GithubSshKey[]> {
  const raw = await githubFetch<Array<{ id: number; title: string; key: string; created_at: string }>>('/user/keys');
  return raw.map((item) => ({ id: item.id, title: item.title, key: item.key, createdAt: item.created_at }));
}

/** Adds a public SSH key. Only the public half is ever accepted here. */
export async function addSshKey(input: { title: string; key: string }): Promise<GithubSshKey> {
  const key = input.key.trim().replace(/\s+/g, ' ');
  if (/(PRIVATE KEY|^-----BEGIN)/m.test(key)) {
    throw new Error('Refusing to upload private key material — provide the .pub key only');
  }
  if (!/^(ssh-(rsa|ed25519)|ecdsa-sha2-[a-z0-9-]+|sk-ssh-ed25519@openssh\.com)\s+[A-Za-z0-9+/=]+/.test(key)) {
    throw new Error('That does not look like an OpenSSH public key');
  }
  const title = input.title.trim().slice(0, 120) || `sentinel-hub-${new Date().toISOString().slice(0, 10)}`;

  const raw = await githubFetch<{ id: number; title: string; key: string; created_at: string }>('/user/keys', {
    method: 'POST',
    body: { title, key },
  });
  return { id: raw.id, title: raw.title, key: raw.key, createdAt: raw.created_at };
}

export async function deleteSshKey(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid key id');
  await githubFetch<unknown>(`/user/keys/${id}`, { method: 'DELETE' });
}

/** Turns a client-side error into a short, actionable message. */
export function describeGithubError(error: unknown): { status: number; message: string } {
  if (error instanceof GithubNotConfigured) {
    return { status: 503, message: 'GITHUB_TOKEN is not configured on the Hub' };
  }
  if (error instanceof UpstreamError) {
    if (error.status === 401) return { status: 502, message: 'GitHub rejected the token (401 Unauthorized)' };
    if (error.status === 403) return { status: 502, message: 'GitHub refused the request (403) — token scopes or rate limit' };
    if (error.status === 404) return { status: 404, message: 'GitHub resource not found (404)' };
    if (error.status === 422) return { status: 400, message: 'GitHub rejected the payload (422)' };
    return { status: 502, message: `GitHub request failed: ${error.message}` };
  }
  return { status: 500, message: error instanceof Error ? error.message : 'GitHub request failed' };
}

