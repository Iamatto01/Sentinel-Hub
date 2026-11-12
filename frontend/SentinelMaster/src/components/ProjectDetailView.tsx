'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorAlert, Loading, Tabs } from './ui';
import { PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { apiPost } from './api';
import { formatBytes, formatNumber, timeAgo, toLines } from './format';
import type { GitBranch, GitLogEntry, GitStatus } from '@/lib/git';
import type { ProjectSummary } from '@/lib/projects';

interface DetailPayload {
  summary: ProjectSummary | null;
  status: GitStatus;
  log: GitLogEntry[];
  branches: GitBranch[];
  diffStat: string;
  changed: string[];
}

interface GeneratedMessage {
  subject: string;
  body: string;
  type: string;
  scope: string | null;
}

const TABS = [
  { id: 'changes', label: 'Working tree' },
  { id: 'history', label: 'History' },
  { id: 'branches', label: 'Branches' },
  { id: 'actions', label: 'Git actions' },
];

/** Summarises whichever git result shape came back so the log stays readable. */
function describeOutcome(data: unknown): string {
  if (data === null || typeof data !== 'object') return String(data ?? 'done');
  const record = data as Record<string, unknown>;
  if (typeof record.hash === 'string') return `commit ${record.hash.slice(0, 8)} — ${String(record.summary ?? '')}`;
  if (typeof record.subject === 'string') return `message: ${record.subject}`;
  if (typeof record.output === 'string') return `git output:\n${record.output}`;
  if (Array.isArray(record.steps)) return `steps:\n- ${(record.steps as string[]).join('\n- ')}`;
  if (typeof record.slug === 'string') return `remote origin → ${record.slug}`;
  return JSON.stringify(record).slice(0, 400);
}

export default function ProjectDetailView({ name }: { name: string }) {
  const base = `/api/projects/${encodeURIComponent(name)}`;
  const detail = usePoll<DetailPayload>(base, 20_000);
  const [tab, setTab] = useState('changes');
  const [message, setMessage] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  const action = useAction(() => detail.refresh());

  const append = useCallback((text: string) => {
    const stamp = new Date().toLocaleTimeString('en-MY', { hour12: false });
    setLines((current) => [...current, `[${stamp}] ${text}`].slice(-240));
  }, []);

  const status = detail.data?.status ?? null;
  const summary = detail.data?.summary ?? null;

  useEffect(() => {
    if (slugTouched) return;
    const remote = status?.remotes[0]?.slug ?? summary?.git.remoteSlug ?? null;
    if (remote) {
      setSlug(remote);
      setSlugTouched(true);
    }
  }, [slugTouched, status?.remotes, summary?.git.remoteSlug]);

  const runGit = useCallback(
    (key: string, label: string, body: Record<string, unknown>) => {
      void action.run(key, async () => {
        append(`→ ${label}`);
        try {
          const envelope = await apiPost<unknown>(`${base}/git`, body);
          append(`✓ ${label}\n${describeOutcome(envelope.data)}`);
          return `${label} completed`;
        } catch (error) {
          append(`✗ ${label} failed — ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      });
    },
    [action, append, base],
  );

  const generateMessage = useCallback(() => {
    void action.run('message', async () => {
      const envelope = await apiPost<GeneratedMessage>(`${base}/git`, { action: 'message' });
      const { subject, body } = envelope.data;
      setMessage(body ? `${subject}\n\n${body}` : subject);
      append(`✓ generated commit message\n${subject}`);
      return 'Commit message generated from the staged diff';
    });
  }, [action, append, base]);

  const staged = status?.staged ?? [];
  const unstaged = status?.unstaged ?? [];
  const untracked = status?.untracked ?? [];
  const changeCount = staged.length + unstaged.length + untracked.length;
  const branches = useMemo(() => detail.data?.branches ?? [], [detail.data?.branches]);
  const changedPaths = useMemo(() => detail.data?.changed ?? [], [detail.data?.changed]);

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          <>
            <Link href="/kali?tab=projects">← Projects</Link>
            {summary ? <span className="faint"> · {summary.path}</span> : null}
          </>
        }
        syncedAt={detail.generatedAt}
      >
        {summary?.webUrl ? (
          <a
            href={summary.webUrl}
            target="_blank"
            rel="noreferrer"
            className="btn sm"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.4)',
              background: 'rgba(56, 189, 248, 0.12)',
              fontWeight: 600,
            }}
          >
            <span>Open Website</span> ↗
          </a>
        ) : null}
        {status?.remotes[0]?.slug || summary?.git.remoteSlug ? (
          <a
            href={`https://github.com/${status?.remotes[0]?.slug ?? summary?.git.remoteSlug}`}
            target="_blank"
            rel="noreferrer"
            className="btn sm ghost"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            GitHub Repo ↗
          </a>
        ) : null}
        <button type="button" className="btn sm ghost" onClick={() => void detail.refresh()} disabled={action.busy !== null}>
          Refresh
        </button>
      </PageHeader>

      <PageBody>
        <ErrorAlert error={detail.error} onRetry={detail.refresh} />
        <ErrorAlert error={action.error} />
        {action.notice ? <div className="alert ok">{action.notice}</div> : null}

        {detail.loading && !detail.data ? (
          <Card>
            <Loading label="Reading repository state…" />
          </Card>
        ) : null}

        <div className="grid cols-4">
          <div className="stat">
            <span className="stat-label">Kind</span>
            <span className="stat-value" style={{ fontSize: 17 }}>
              {summary?.kind ?? 'unknown'}
            </span>
            <span className="stat-foot">{summary?.framework ?? 'no framework detected'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Working tree</span>
            <span className="stat-value" style={{ fontSize: 17 }}>
              {!status?.isRepo ? 'no git' : status.clean ? 'clean' : `${formatNumber(changeCount)} changes`}
            </span>
            <span className="stat-foot">
              {status?.isRepo
                ? `${formatNumber(status.ahead)} ahead · ${formatNumber(status.behind)} behind`
                : 'initialise to track'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Size</span>
            <span className="stat-value" style={{ fontSize: 17 }}>
              {formatBytes(summary?.totalBytes)}
            </span>
            <span className="stat-foot">modified {timeAgo(summary?.modifiedAt)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Branch</span>
            <span className="stat-value mono" style={{ fontSize: 15 }}>
              {status?.branch ?? '—'}
            </span>
            <span className="stat-foot">{status?.upstream ? `tracking ${status.upstream}` : 'no upstream configured'}</span>
          </div>
        </div>

        <div className="grid cols-2">
          <Card title="Metadata">
            {summary ? (
              <dl className="kv">
                {summary.webUrl ? (
                  <>
                    <dt>Live URL</dt>
                    <dd className="mono">
                      <a
                        href={summary.webUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#38bdf8',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontWeight: 500,
                        }}
                      >
                        <span>{summary.webUrl}</span> ↗
                      </a>
                    </dd>
                  </>
                ) : null}
                <dt>Path</dt>
                <dd className="mono truncate">{summary.path}</dd>
                <dt>Package manager</dt>
                <dd>{summary.packageManager ?? '—'}</dd>
                <dt>package.json</dt>
                <dd>{summary.hasPackageJson ? 'present' : 'missing'}</dd>
                <dt>README</dt>
                <dd>{summary.hasReadme ? 'present' : 'missing'}</dd>
                <dt>.env file</dt>
                <dd>{summary.hasEnvFile ? <Badge tone="amber">present</Badge> : 'absent'}</dd>
                <dt>Entry hints</dt>
                <dd className="mono">{summary.entryHints.length > 0 ? summary.entryHints.join(', ') : '—'}</dd>
                <dt>npm scripts</dt>
                <dd className="mono">{summary.scripts.length > 0 ? summary.scripts.join(', ') : '—'}</dd>
                <dt>Description</dt>
                <dd>{summary.description ?? '—'}</dd>
              </dl>
            ) : (
              <Empty title="No summary available" />
            )}
          </Card>

          <Card title="Repository">
            {status?.isRepo ? (
              <dl className="kv">
                <dt>Remotes</dt>
                <dd className="mono truncate">
                  {status.remotes.length > 0
                    ? status.remotes.map((remote) => {
                        const targetUrl = remote.slug
                          ? `https://github.com/${remote.slug}`
                          : remote.url && (remote.url.startsWith('http://') || remote.url.startsWith('https://'))
                            ? remote.url
                            : null;
                        return targetUrl ? (
                          <a
                            key={remote.name}
                            href={targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#38bdf8',
                              textDecoration: 'none',
                              marginRight: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>{remote.name} → {remote.slug ?? remote.url}</span> ↗
                          </a>
                        ) : (
                          <span key={remote.name} style={{ marginRight: 8 }}>
                            {remote.name} → {remote.slug ?? remote.url}
                          </span>
                        );
                      })
                    : '—'}
                </dd>
                <dt>Last commit</dt>
                <dd>
                  {summary?.git.lastCommit
                    ? `${summary.git.lastCommit.hash.slice(0, 8)} · ${timeAgo(summary.git.lastCommit.date)}`
                    : 'none yet'}
                </dd>
                <dt>Identity</dt>
                <dd className="mono">
                  {status.identity.name ?? 'unset'} &lt;{status.identity.email ?? 'unset'}&gt;
                </dd>
                <dt>Staged</dt>
                <dd>{formatNumber(staged.length)}</dd>
                <dt>Unstaged</dt>
                <dd>{formatNumber(unstaged.length)}</dd>
                <dt>Untracked</dt>
                <dd>{formatNumber(untracked.length)}</dd>
              </dl>
            ) : (
              <Empty title="Not a git repository">
                Open the Git actions tab and run Initialise to create one with a managed .gitignore.
              </Empty>
            )}
          </Card>
        </div>

        <Card flush>
          <Tabs items={TABS} active={tab} onChange={setTab} />
          <div style={{ padding: 16 }}>
            {tab === 'changes' ? (
              changeCount === 0 ? (
                <Empty title="Working tree is clean">Nothing to stage or commit right now.</Empty>
              ) : (
                <div className="stack">
                  <div className="row" style={{ gap: 7 }}>
                    {staged.length > 0 ? <Badge tone="green">{formatNumber(staged.length)} staged</Badge> : null}
                    {unstaged.length > 0 ? <Badge tone="amber">{formatNumber(unstaged.length)} unstaged</Badge> : null}
                    {untracked.length > 0 ? <Badge tone="blue">{formatNumber(untracked.length)} untracked</Badge> : null}
                  </div>
                  {detail.data?.diffStat ? <pre className="log">{toLines(detail.data.diffStat).join('\n')}</pre> : null}
                  <div className="scroll-y" style={{ maxHeight: 360 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Path</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedPaths.map((entry) => (
                          <tr key={entry}>
                            <td className="mono truncate">{entry}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : null}

            {tab === 'history' ? (
              (detail.data?.log.length ?? 0) === 0 ? (
                <Empty title="No commits yet" />
              ) : (
                <div className="scroll-y">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Commit</th>
                        <th>Subject</th>
                        <th>Author</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data?.log.map((entry) => (
                        <tr key={entry.hash}>
                          <td className="mono nowrap">{entry.shortHash}</td>
                          <td className="truncate">{entry.subject}</td>
                          <td className="faint nowrap">{entry.author}</td>
                          <td className="faint nowrap">{timeAgo(entry.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {tab === 'branches' ? (
              branches.length === 0 ? (
                <Empty title="No branches" />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Upstream</th>
                      <th>Ahead</th>
                      <th>Behind</th>
                      <th>Last commit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((branch) => (
                      <tr key={branch.name}>
                        <td className="mono">
                          {branch.name} {branch.current ? <Badge tone="blue">current</Badge> : null}
                        </td>
                        <td className="mono faint truncate">{branch.upstream ?? '—'}</td>
                        <td className="numeric">{formatNumber(branch.ahead)}</td>
                        <td className="numeric">{formatNumber(branch.behind)}</td>
                        <td className="faint nowrap">{timeAgo(branch.lastCommitDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {tab === 'actions' ? (
              <div className="stack">
                <div className="grid cols-2">
                  <div className="field">
                    <label htmlFor="commit-message">Commit message</label>
                    <textarea
                      id="commit-message"
                      className="textarea"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Leave empty and the Hub will describe the staged diff for you"
                      spellCheck={false}
                    />
                    <div className="row" style={{ gap: 7 }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={generateMessage}
                        disabled={action.busy !== null || !status?.isRepo}
                      >
                        {action.busy === 'message' ? <span className="spinner" /> : null}
                        Generate from diff
                      </button>
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() => runGit('commit', 'stage and commit', { action: 'commit', message })}
                        disabled={action.busy !== null || !status?.isRepo || status.clean}
                      >
                        {action.busy === 'commit' ? <span className="spinner" /> : null}
                        Stage &amp; commit
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="remote-slug">GitHub remote (owner/repository)</label>
                    <input
                      id="remote-slug"
                      className="input mono"
                      value={slug}
                      onChange={(event) => {
                        setSlug(event.target.value);
                        setSlugTouched(true);
                      }}
                      placeholder="Iamatto01/my-project"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <div className="row" style={{ gap: 7 }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => runGit('remote', 'set origin remote', { action: 'remote', slug: slug.trim() })}
                        disabled={action.busy !== null || !status?.isRepo || slug.trim().length === 0}
                      >
                        {action.busy === 'remote' ? <span className="spinner" /> : null}
                        Set remote
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => runGit('pull', 'pull from origin', { action: 'pull' })}
                        disabled={action.busy !== null || !status?.isRepo}
                      >
                        {action.busy === 'pull' ? <span className="spinner" /> : null}
                        Pull
                      </button>
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() => runGit('push', 'push to origin', { action: 'push' })}
                        disabled={action.busy !== null || !status?.isRepo}
                      >
                        {action.busy === 'push' ? <span className="spinner" /> : null}
                        Push
                      </button>
                    </div>
                    <span className="faint" style={{ fontSize: 11.5 }}>
                      Push and pull use the GITHUB_TOKEN stored on the host — no credentials are written into .git/config.
                    </span>
                  </div>
                </div>

                <div className="row">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => runGit('init', 'initialise repository', { action: 'init' })}
                    disabled={action.busy !== null || Boolean(status?.isRepo)}
                  >
                    {action.busy === 'init' ? <span className="spinner" /> : null}
                    Initialise repository
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => runGit('ignore', 'refresh .gitignore coverage', { action: 'ignore' })}
                    disabled={action.busy !== null}
                  >
                    {action.busy === 'ignore' ? <span className="spinner" /> : null}
                    Refresh .gitignore
                  </button>
                </div>

                {lines.length > 0 ? (
                  <>
                    <pre className="log">{lines.join('\n')}</pre>
                    <div className="row">
                      <button type="button" className="btn sm ghost" onClick={() => setLines([])}>
                        Clear output
                      </button>
                    </div>
                  </>
                ) : (
                  <Empty title="No operations run yet">
                    Actions appear here with their full git output so nothing happens silently.
                  </Empty>
                )}
              </div>
            ) : null}
          </div>
        </Card>
      </PageBody>
    </>
  );
}
