import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { ExecFailure, runGit, lines } from './exec';

/**
 * Git operations for managed projects.
 *
 * Every command is invoked with an argument array (no shell) and with the
 * project root pinned via `git -C`, so a project or branch name can never be
 * interpreted as a command or a path traversal.
 */

const ASKPASS = path.join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'git-askpass.cjs');

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  staged: Array<{ status: string; file: string }>;
  unstaged: Array<{ status: string; file: string }>;
  untracked: string[];
  remotes: Array<{ name: string; url: string; slug: string | null }>;
  identity: { name: string | null; email: string | null };
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitDate: string;
}

function parseSlug(url: string): string | null {
  const match = url.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

async function gitOut(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(args, cwd);
    return stdout;
  } catch (error) {
    if (error instanceof ExecFailure && error.result.stdout.trim()) return error.result.stdout;
    return null;
  }
}

/** Sanitizes a commit message: strips control characters and caps the length. */
export function sanitizeCommitMessage(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+$/, ''))
    .join('\n')
    .trim()
    .slice(0, 4000);
}

/** Command-line safe commit message: never begins with `-`. */
export function commitMessageArg(message: string): string {
  const cleaned = sanitizeCommitMessage(message) || 'chore: update project';
  return cleaned.startsWith('-') ? ` ${cleaned}` : cleaned;
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  const empty: GitStatus = {
    isRepo: false,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    clean: true,
    staged: [],
    unstaged: [],
    untracked: [],
    remotes: [],
    identity: { name: null, email: null },
  };
  if (!existsSync(path.join(cwd, '.git'))) return empty;

  const statusOutput = await gitOut(['status', '--porcelain=v1', '--branch', '--untracked-files=normal'], cwd);
  if (statusOutput !== null) {
    const all = statusOutput.split(/\r?\n/).filter((line) => line.length > 0);
    const header = all.find((line) => line.startsWith('##'));
    if (header) {
      const branchPart = header.slice(2).trim();
      const [branchAndUpstream] = branchPart.split(' [');
      if (branchAndUpstream) {
        const [branch, upstream] = branchAndUpstream.split('...');
        empty.branch = branch === 'HEAD (no branch)' ? null : branch ?? null;
        empty.upstream = upstream ?? null;
      }
      const ab = branchPart.match(/\[(.*)\]/)?.[1] ?? '';
      const ahead = ab.match(/ahead (\d+)/);
      const behind = ab.match(/behind (\d+)/);
      empty.ahead = ahead ? Number(ahead[1]) : 0;
      empty.behind = behind ? Number(behind[1]) : 0;
    }

    for (const line of all.filter((l) => !l.startsWith('##'))) {
      const index = line.slice(0, 1);
      const worktree = line.slice(1, 2);
      const file = line.slice(3);
      if (index === '?' && worktree === '?') {
        empty.untracked.push(file);
        continue;
      }
      if (index !== ' ' && index !== '?') empty.staged.push({ status: index, file });
      if (worktree !== ' ' && worktree !== '?') empty.unstaged.push({ status: worktree, file });
    }
    empty.clean = empty.staged.length === 0 && empty.unstaged.length === 0 && empty.untracked.length === 0;
  }

  const remotesRaw = await gitOut(['remote', '-v'], cwd);
  if (remotesRaw) {
    const seen = new Map<string, string>();
    for (const line of lines(remotesRaw)) {
      const [name, url] = line.split(/\s+/);
      if (name && url && !seen.has(name)) seen.set(name, url);
    }
    empty.remotes = [...seen].map(([name, url]) => ({ name, url, slug: parseSlug(url) }));
  }

  const [name, email] = await Promise.all([
    gitOut(['config', '--get', 'user.name'], cwd),
    gitOut(['config', '--get', 'user.email'], cwd),
  ]);
  empty.identity = { name: name?.trim() || null, email: email?.trim() || null };

  return empty;
}

export async function getLog(cwd: string, limit = 30): Promise<GitLogEntry[]> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit) || 30), 200);
  const output = await gitOut(
    ['log', `-${safeLimit}`, '--date=iso-strict', '--format=%H%x1f%h%x1f%an%x1f%cI%x1f%s'],
    cwd,
  );
  if (!output) return [];
  return lines(output).map((line) => {
    const [hash = '', shortHash = '', author = '', date = '', ...subject] = line.split('\u001f');
    return { hash, shortHash, author, date, subject: subject.join('\u001f') };
  });
}

export async function getBranches(cwd: string): Promise<GitBranch[]> {
  const output = await gitOut(
    [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)%x1f%(HEAD)%x1f%(upstream:short)%x1f%(ahead-behind:HEAD)%x1f%(committerdate:iso-strict)',
      'refs/heads',
    ],
    cwd,
  );
  if (!output) return [];
  return lines(output).map((line) => {
    const [name = '', head = '', upstream = '', aheadBehind = '', date = ''] = line.split('\u001f');
    const [ahead = '0', behind = '0'] = aheadBehind.trim().split(/\s+/);
    return {
      name,
      current: head.trim() === '*',
      upstream: upstream || null,
      ahead: Number(ahead) || 0,
      behind: Number(behind) || 0,
      lastCommitDate: date,
    };
  });
}

export async function getDiffStat(cwd: string): Promise<string> {
  const [staged, unstaged] = await Promise.all([
    gitOut(['diff', '--cached', '--stat'], cwd),
    gitOut(['diff', '--stat'], cwd),
  ]);
  return [staged, unstaged].filter(Boolean).join('\n').trim();
}

/** Returns a capped list of changed file paths, used to build the commit summary. */
export async function getChangedPaths(cwd: string): Promise<string[]> {
  const output = await gitOut(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  if (!output) return [];
  return lines(output)
    .map((line) => line.slice(3))
    .filter((file) => file.length > 0)
    .slice(0, 400);
}

export interface GeneratedCommitMessage {
  subject: string
  body: string;
  type: string;
  scope: string | null;
}

/**
 * Builds a conventional-commit message from the staged change set. This is a
 * deterministic summary (net line counts per area) rather than a model call, so
 * it never sends repository contents anywhere.
 */
export async function generateCommitMessage(cwd: string): Promise<GeneratedCommitMessage> {
  const [numstat, paths] = await Promise.all([
    gitOut(['diff', '--cached', '--numstat', 'HEAD'], cwd).then((v) => v ?? gitOut(['diff', '--cached', '--numstat'], cwd)),
    getChangedPaths(cwd),
  ]);

  let added = 0;
  let removed = 0;
  const areas = new Map<string, number>();

  for (const line of lines(numstat ?? '')) {
    const [add, del, file] = line.split(/\t/);
    const a = Number(add);
    const d = Number(del);
    if (Number.isFinite(a)) added += a;
    if (Number.isFinite(d)) removed += d;
    if (file) {
      const area = file.includes('/') ? file.split('/')[0]! : path.dirname(file) || '.';
      areas.set(area, (areas.get(area) ?? 0) + 1);
    }
  }

  const topAreas = [...areas]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  const docsOnly = paths.length > 0 && paths.every((p) => /\.(md|txt|rst)$/i.test(p) || p.startsWith('docs/'));
  const testsOnly = paths.length > 0 && paths.every((p) => /(^|\/)(tests?|__tests__|spec)\//.test(p) || /\.(test|spec)\./.test(p));
  const depsOnly = paths.length > 0 && paths.every((p) => /(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt)$/.test(p));

  let type = 'feat';
  if (depsOnly) type = 'chore';
  else if (testsOnly) type = 'test';
  else if (docsOnly) type = 'docs';
  else if (removed > added * 1.5) type = 'refactor';

  const scope = topAreas.length === 1 && topAreas[0] !== '.' ? topAreas[0] : null;
  const subject = `${type}${scope ? `(${scope})` : ''}: update ${paths.length} file${paths.length === 1 ? '' : 's'}`;

  const bodyLines = [
    `Files changed: ${paths.length}`,
    `Lines added: ${added}`,
    `Lines removed: ${removed}`,
    topAreas.length > 0 ? `Areas touched: ${topAreas.join(', ')}` : '',
    '',
    'Changed files:',
    ...paths.slice(0, 25).map((file) => `- ${file}`),
    paths.length > 25 ? `- … and ${paths.length - 25} more` : '',
  ].filter((line) => line !== '');

  return { subject, body: bodyLines.join('\n'), type, scope };
}

/** Gitignore block appended when a project has no coverage for secrets. */
const MANAGED_GITIGNORE_BLOCK = `
# ── Sentinel Hub managed block ──────────────────────────────────────────────
# Keep credentials and build output out of version control.
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
id_rsa*
id_ed25519*
.npmrc
.netrc
node_modules/
__pycache__/
*.py[cod]
# ── end Sentinel Hub managed block ──────────────────────────────────────────
`;

/**
 * Appends the managed secret-blocking `.gitignore` block. Idempotent: the
 * marker line makes a second call a no-op, so "Init Git" is always safe to
 * re-run on a repository that was already initialised.
 */
export async function ensureIgnoreCoverage(cwd: string): Promise<boolean> {
  const gitignorePath = path.join(cwd, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = await readFile(gitignorePath, 'utf8');
    if (existing.includes('end Sentinel Hub managed block')) return false;
  }
  await appendFile(gitignorePath, MANAGED_GITIGNORE_BLOCK, 'utf8');
  return true;
}

export interface InitResult {
  created: boolean;
  branch: string;
  gitignoreAdded: boolean;
  identityConfigured: boolean;
  steps: string[];
  status: GitStatus;
}

/**
 * Initializes a repository with `main` as the default branch, guarantees
 * .gitignore coverage for secrets and build output, and configures a local
 * identity when the machine has none.
 */
export async function initRepository(cwd: string): Promise<InitResult> {
  const steps: string[] = [];
  let created = false;

  if (!existsSync(path.join(cwd, '.git'))) {
    await runGit(['init', '-b', 'main'], cwd);
    created = true;
    steps.push('Initialized repository with default branch main');
  } else {
    steps.push('Repository already initialized');
  }

  const gitignoreAdded = await ensureIgnoreCoverage(cwd);
  if (gitignoreAdded) steps.push('Added .gitignore coverage for secrets and build output');

  let identityConfigured = false;
  const status = await getStatus(cwd);
  if (!status.identity.name || !status.identity.email) {
    const fallbackName = env.github.username ?? 'Sentinel Hub';
    const fallbackEmail = env.github.username ? `${env.github.username}@users.noreply.github.com` : 'hub@sentinelai.studio';
    await runGit(['config', 'user.name', fallbackName], cwd);
    await runGit(['config', 'user.email', fallbackEmail], cwd);
    identityConfigured = true;
    steps.push(`Configured local git identity as ${fallbackName} <${fallbackEmail}>`);
  }

  const branch = (await gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], cwd))?.trim() ?? 'main';

  return {
    created,
    branch,
    gitignoreAdded,
    identityConfigured,
    steps,
    status: await getStatus(cwd),
  };
}

/** Sets (or updates) the origin remote. The URL is validated before use. */
export async function setRemote(cwd: string, slug: string): Promise<void> {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(slug)) {
    throw new Error('Remote slug must look like owner/repo');
  }
  const url = `https://github.com/${slug}.git`;
  const current = await gitOut(['config', '--get', 'remote.origin.url'], cwd);
  if (current && current.trim()) await runGit(['remote', 'set-url', 'origin', url], cwd);
  else await runGit(['remote', 'add', 'origin', url], cwd);
}

/** Stages everything, then commits. Secret files are already ignored. */
export async function stageAndCommit(cwd: string, message: string): Promise<{ hash: string; summary: string }> {
  await runGit(['add', '--all'], cwd);

  const staged = await gitOut(['diff', '--cached', '--name-only'], cwd);
  if (!staged || staged.trim().length === 0) {
    throw new Error('Nothing to commit — the working tree is clean');
  }

  await runGit(['commit', '-m', commitMessageArg(message)], cwd, 120_000);
  const hash = (await gitOut(['rev-parse', 'HEAD'], cwd))?.trim() ?? '';
  const summary = (await gitOut(['log', '-1', '--format=%s'], cwd))?.trim() ?? '';
  return { hash, summary };
}

export interface PushResult {
  remote: string;
  branch: string;
  output: string;
}

/**
 * Pushes to GitHub using an askpass helper so the token is passed through the
 * environment and never written to .git/config or exposed in argv.
 */
export async function push(cwd: string, branch: string, remote = 'origin'): Promise<PushResult> {
  if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(branch)) throw new Error('Invalid branch name');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(remote)) throw new Error('Invalid remote name');
  if (!env.github.token) throw new Error('GITHUB_TOKEN is not configured');

  const result = await runGitWithAuth(['push', '--set-upstream', remote, branch], cwd);
  return { remote, branch, output: `${result.stdout}\n${result.stderr}`.trim() };
}

export async function pull(cwd: string, branch?: string): Promise<PushResult> {
  const target = branch && /^[A-Za-z0-9._\/-]{1,120}$/.test(branch) ? branch : null;
  const args = target ? ['pull', '--ff-only', 'origin', target] : ['pull', '--ff-only'];
  const result = await runGitWithAuth(args, cwd);
  const current = (await gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], cwd))?.trim() ?? 'HEAD';
  return { remote: 'origin', branch: current, output: `${result.stdout}\n${result.stderr}`.trim() };
}

async function runGitWithAuth(args: string[], cwd: string, timeoutMs = 180_000) {
  const { spawn } = await import('node:child_process');
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: ASKPASS,
        SSH_ASKPASS: ASKPASS,
        SENTINEL_GIT_TOKEN: env.github.token ?? '',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
      },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`git ${args[0]} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 512_000) stdout = stdout.slice(-512_000);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 512_000) stderr = stderr.slice(-512_000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

/** Creates the local SSH key and returns the public half, if one exists. */
export async function readLocalPublicKey(): Promise<{ path: string; algorithm: string; publicKey: string } | null> {
  const { homedir } = await import('node:os');
  const { readFile, readdir } = await import('node:fs/promises');
  const sshDir = path.join(homedir(), '.ssh');
  if (!existsSync(sshDir)) return null;

  const entries = await readdir(sshDir).catch(() => [] as string[]);
  const pub = entries.find((file) => file.endsWith('.pub'));
  if (!pub) return null;

  try {
    const publicKey = (await readFile(path.join(sshDir, pub), 'utf8')).trim();
    return { path: path.join(sshDir, pub), algorithm: publicKey.split(/\s+/)[0] ?? 'unknown', publicKey };
  } catch {
    return null;
  }
}
