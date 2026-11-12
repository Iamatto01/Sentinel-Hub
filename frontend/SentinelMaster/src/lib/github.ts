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

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
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
}

export interface GithubSshKey {
  id: number;
  title: string;
  key: string;
  createdAt: string;
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
}): GithubRepo {
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    private: raw.private,
    htmlUrl: raw.html_url,
    cloneUrl: raw.clone_url,
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
    // A concurrent create would surface as a 422; resolve it to the existing repo.
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
