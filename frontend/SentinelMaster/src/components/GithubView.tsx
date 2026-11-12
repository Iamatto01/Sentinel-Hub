'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, Stat, Tabs } from './ui';
import { NotConfigured, PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { apiDelete, apiPost } from './api';
import { formatBytes, formatNumber, timeAgo } from './format';
import type { GithubRepo, GithubSshKey, GithubUser } from '@/lib/github';

interface GithubOverview {
  configured: true;
  user: GithubUser;
  username: string | null;
  scopes: string[];
  repos: GithubRepo[];
  localBySlug: Record<string, string>;
  unreferencedLocalRepos: string[];
}

interface GithubUnconfigured {
  configured: false;
  reason: string;
}

type GithubPayload = GithubOverview | GithubUnconfigured;

interface LocalPublicKey {
  path: string;
  algorithm: string;
  publicKey: string;
}

interface KeysPayload {
  keys: GithubSshKey[];
  local: LocalPublicKey | null;
  localAlreadyUploaded: boolean;
}

const TABS = [
  { id: 'repos', label: 'Repositories' },
  { id: 'keys', label: 'SSH keys' },
];

/** Required scopes for the features the Hub drives. */
const REQUIRED_SCOPES = ['repo', 'read:user', 'admin:public_key'];

function scopeTone(scope: string): 'green' | 'blue' | 'grey' {
  if (scope === 'repo') return 'green';
  if (scope === 'admin:public_key') return 'blue';
  return 'grey';
}

function RepoRow({ repo, localProject }: { repo: GithubRepo; localProject?: string }) {
  return (
    <tr>
      <td>
        <div className="stack" style={{ gap: 2 }}>
          <a href={repo.htmlUrl} target="_blank" rel="noreferrer noopener" className="truncate">
            {repo.fullName}
          </a>
          {repo.description ? <span className="faint truncate">{repo.description}</span> : null}
        </div>
      </td>
      <td>
        <Badge tone={repo.private ? 'violet' : 'grey'}>{repo.private ? 'private' : 'public'}</Badge>
      </td>
      <td className="nowrap">
        {localProject ? (
          <Link href={`/projects/${encodeURIComponent(localProject)}`}>
            <Badge tone="green">{localProject}</Badge>
          </Link>
        ) : (
          <span className="faint">cloud only</span>
        )}
      </td>
      <td className="nowrap dim">{repo.language ?? '—'}</td>
      <td className="numeric">{formatNumber(repo.stars)}</td>
      <td className="numeric">{formatNumber(repo.openIssues)}</td>
      <td className="numeric dim">{formatBytes(repo.sizeKb * 1024)}</td>
      <td className="nowrap dim">{timeAgo(repo.pushedAt)}</td>
    </tr>
  );
}

export default function GithubView() {
  const [tab, setTab] = useState('repos');
  const [query, setQuery] = useState('');
  const [keyTitle, setKeyTitle] = useState('');
  const [keyMaterial, setKeyMaterial] = useState('');

  const github = usePoll<GithubPayload>('/api/github', 60_000);
  const keys = usePoll<KeysPayload>('/api/github/keys', 0);
  const action = useAction(() => {
    keys.refresh();
  });

  const overview = github.data?.configured === true ? github.data : null;
  const unconfigured = github.data?.configured === false ? github.data : null;

  const filtered = useMemo(() => {
    const repos = overview?.repos ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(needle) ||
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.language ?? '').toLowerCase().includes(needle) ||
        repo.topics.some((topic) => topic.toLowerCase().includes(needle)),
    );
  }, [overview, query]);

  const scopes = overview?.scopes ?? [];
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));

  const uploadLocalKey = (useLocal: boolean) =>
    action.run(useLocal ? 'upload-local' : 'upload-manual', async () => {
      if (!useLocal && !keyTitle.trim()) throw new Error('A key title is required');
      await apiPost<GithubSshKey>(
        '/api/github/keys',
        useLocal ? { useLocal: true } : { title: keyTitle.trim(), key: keyMaterial.trim() },
      );
      setKeyTitle('');
      setKeyMaterial('');
      return useLocal ? 'Local public key uploaded to GitHub' : 'Public key uploaded to GitHub';
    });

  const removeKey = (id: number, title: string) =>
    action.run(`delete-${id}`, async () => {
      await apiDelete(`/api/github/keys?id=${id}`);
      return `Removed “${title}”`;
    });

  return (
    <>
      <PageHeader
        title="GitHub"
        subtitle="Account, repositories and SSH deploy keys wired to your local projects"
        syncedAt={github.generatedAt}
      >
        <button type="button" className="btn sm" onClick={github.refresh} disabled={github.loading}>
          {github.loading ? <span className="spinner" /> : null}
          Refresh
        </button>
      </PageHeader>

      <PageBody>
        <ErrorAlert error={github.error} onRetry={github.refresh} />
        <ErrorAlert error={action.error} />
        {action.notice ? <div className="alert ok">{action.notice}</div> : null}

        {unconfigured ? (
          <NotConfigured
            title="GitHub is not connected yet"
            variable="GITHUB_TOKEN"
            detail={
              <>
                Create a fine-grained or classic token with <code className="mono">repo</code>,{' '}
                <code className="mono">read:user</code> and <code className="mono">admin:public_key</code> scopes, then
                restart the Hub service. {unconfigured.reason}
              </>
            }
          />
        ) : null}

        {github.loading && !github.data ? (
          <Card>
            <Loading label="Contacting GitHub…" />
          </Card>
        ) : null}

        {overview ? (
          <>
            <div className="grid cols-4">
              <Stat
                label="Account"
                value={overview.user.login}
                foot={overview.user.name ?? overview.user.htmlUrl}
              />
              <Stat
                label="Repositories"
                value={formatNumber(overview.repos.length)}
                foot={`${formatNumber(overview.repos.filter((repo) => repo.private).length)} private`}
              />
              <Stat
                label="Linked locally"
                value={formatNumber(Object.keys(overview.localBySlug).length)}
                foot={`${formatNumber(overview.unreferencedLocalRepos.length)} local repo(s) without a remote`}
              />
              <Stat
                label="Token scopes"
                value={formatNumber(scopes.length)}
                foot={missingScopes.length > 0 ? `missing: ${missingScopes.join(', ')}` : 'all required scopes present'}
              />
            </div>

            {missingScopes.length > 0 ? (
              <Alert kind="warn">
                The token is missing <code className="mono">{missingScopes.join(', ')}</code>. Push, repository listing
                or SSH key management will fail until the token is reissued with those scopes.
              </Alert>
            ) : null}

            {overview.unreferencedLocalRepos.length > 0 ? (
              <Alert kind="info">
                <span>
                  {overview.unreferencedLocalRepos.length} local Git repo(s) have no remote configured:{' '}
                  <span className="mono truncate">{overview.unreferencedLocalRepos.join(', ')}</span>. Open each project
                  to set a remote and push.
                </span>
              </Alert>
            ) : null}

            <div className="grid cols-2">
              <Card title="Repository inventory" note={`${formatNumber(filtered.length)} of ${formatNumber(overview.repos.length)} shown`} flush>
                <div className="row" style={{ padding: '0 0 12px', gap: 8 }}>
                  <input
                    className="input search"
                    type="search"
                    placeholder="Filter by name, language or topic…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Filter repositories"
                  />
                </div>
                {filtered.length === 0 ? (
                  <Empty title="No repositories matched">
                    Clear the filter or check that the token can read this account’s repositories.
                  </Empty>
                ) : (
                  <div className="scroll-y">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Repository</th>
                          <th>Visibility</th>
                          <th>Local project</th>
                          <th>Language</th>
                          <th className="numeric">Stars</th>
                          <th className="numeric">Issues</th>
                          <th className="numeric">Size</th>
                          <th>Last push</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((repo) => (
                          <RepoRow
                            key={repo.id}
                            repo={repo}
                            localProject={overview.localBySlug[repo.fullName.toLowerCase()]}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Account detail" note="Read directly from the GitHub API with the Hub token">
                <dl className="kv">
                  <dt>Login</dt>
                  <dd>{overview.user.login}</dd>
                  <dt>Name</dt>
                  <dd>{overview.user.name ?? '—'}</dd>
                  <dt>Profile</dt>
                  <dd>
                    <a href={overview.user.htmlUrl} target="_blank" rel="noreferrer noopener">
                      {overview.user.htmlUrl}
                    </a>
                  </dd>
                  <dt>Public repos</dt>
                  <dd>{formatNumber(overview.user.publicRepos)}</dd>
                  <dt>Followers</dt>
                  <dd>{formatNumber(overview.user.followers)}</dd>
                  <dt>Account created</dt>
                  <dd>{timeAgo(overview.user.createdAt)}</dd>
                  <dt>Configured user</dt>
                  <dd>{overview.username ?? 'not pinned — any account the token can reach'}</dd>
                  <dt>Granted scopes</dt>
                  <dd>
                    {scopes.length === 0 ? (
                      <span className="faint">none reported (fine-grained token?)</span>
                    ) : (
                      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {scopes.map((scope) => (
                          <Badge key={scope} tone={scopeTone(scope)}>
                            {scope}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </dd>
                </dl>
              </Card>
            </div>

            <Tabs items={TABS} active={tab} onChange={setTab} />

            {tab === 'repos' ? (
              <Card title="How this tab works" note="Repository rows link straight to GitHub and to the matching local project">
                <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                  <li>
                    The <strong>Local project</strong> badge appears when a local Git repo’s <code className="mono">origin</code>{' '}
                    matches the repository’s <code className="mono">owner/name</code> slug.
                  </li>
                  <li>
                    Use the <strong>Projects</strong> page to initialise a repo, set its remote and push in one step.
                  </li>
                  <li>Push and pull from the Hub authenticate with the token — no interactive prompt is possible.</li>
                </ul>
              </Card>
            ) : (
              <SshKeyPanel
                payload={keys.data}
                loading={keys.loading}
                error={keys.error}
                onRefresh={keys.refresh}
                busy={action.busy}
                keyTitle={keyTitle}
                keyMaterial={keyMaterial}
                onTitleChange={setKeyTitle}
                onMaterialChange={setKeyMaterial}
                onUploadLocal={() => void uploadLocalKey(true)}
                onUploadManual={() => void uploadLocalKey(false)}
                onDelete={(id, title) => void removeKey(id, title)}
              />
            )}
          </>
        ) : null}
      </PageBody>
    </>
  );
}

function SshKeyPanel({
  payload,
  loading,
  error,
  onRefresh,
  busy,
  keyTitle,
  keyMaterial,
  onTitleChange,
  onMaterialChange,
  onUploadLocal,
  onUploadManual,
  onDelete,
}: {
  payload: KeysPayload | null;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
  busy: string | null;
  keyTitle: string;
  keyMaterial: string;
  onTitleChange: (value: string) => void;
  onMaterialChange: (value: string) => void;
  onUploadLocal: () => void;
  onUploadManual: () => void;
  onDelete: (id: number, title: string) => void;
}) {
  return (
    <>
      <ErrorAlert error={error} onRetry={onRefresh} />

      {loading && !payload ? (
        <Card>
          <Loading label="Reading SSH keys…" />
        </Card>
      ) : null}

      <div className="grid cols-2">
        <Card
          title="Registered SSH keys"
          actions={<Badge tone="grey">{formatNumber(payload?.keys.length ?? 0)}</Badge>}
          note="Only public key material can be uploaded — the Hub refuses anything containing private key data"
          flush
        >
          {!payload || payload.keys.length === 0 ? (
            <Empty title="No SSH keys registered">
              Add the local public key so the Kali server and this Hub can push without a password prompt.
            </Empty>
          ) : (
            <div className="scroll-y">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Key</th>
                    <th>Added</th>
                    <th className="numeric">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.keys.map((key) => (
                    <tr key={key.id}>
                      <td className="nowrap">{key.title}</td>
                      <td className="mono truncate" title={key.key}>
                        {key.key.split(/\s+/).slice(0, 2).join(' ')}…
                      </td>
                      <td className="nowrap dim">{timeAgo(key.createdAt)}</td>
                      <td className="numeric">
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() => onDelete(key.id, key.title)}
                          disabled={busy !== null}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Local key & upload" note="The private key never leaves this machine">
          {!payload?.local ? (
            <Alert kind="warn">
              No public key found next to the configured private key. Generate one with{' '}
              <code className="mono">ssh-keygen -t ed25519 -C &quot;sentinel-hub&quot;</code> and reload this page.
            </Alert>
          ) : (
            <dl className="kv">
              <dt>Algorithm</dt>
              <dd>
                <Badge tone="blue">{payload.local.algorithm}</Badge>
              </dd>
              <dt>File</dt>
              <dd className="mono truncate">{payload.local.path}</dd>
              <dt>Status on GitHub</dt>
              <dd>
                <Badge tone={payload.localAlreadyUploaded ? 'green' : 'amber'}>
                  {payload.localAlreadyUploaded ? 'already uploaded' : 'not uploaded'}
                </Badge>
              </dd>
            </dl>
          )}

          {payload?.local ? (
            <>
              <label className="field" htmlFor="local-key-material">
                Public key material
              </label>
              <textarea
                id="local-key-material"
                className="textarea"
                readOnly
                value={payload.local.publicKey}
                rows={4}
              />
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={onUploadLocal}
                  disabled={busy !== null || payload.localAlreadyUploaded}
                >
                  {busy === 'upload-local' ? <span className="spinner" /> : null}
                  {payload.localAlreadyUploaded ? 'Already registered' : 'Upload local public key'}
                </button>
              </div>
            </>
          ) : null}

          <hr className="divider" />

          <p className="dim" style={{ marginTop: 0 }}>
            Or paste a different public key. Titles are how you will recognise the key on GitHub.
          </p>
          <label className="field" htmlFor="key-title">
            Title
          </label>
          <input
            id="key-title"
            className="input"
            value={keyTitle}
            maxLength={120}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="sentinel-kali-server"
          />
          <label className="field" htmlFor="key-material" style={{ marginTop: 10 }}>
            Public key
          </label>
          <textarea
            id="key-material"
            className="textarea"
            value={keyMaterial}
            onChange={(event) => onMaterialChange(event.target.value)}
            placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… sentinel"
            rows={4}
          />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={onUploadManual}
              disabled={busy !== null || !keyTitle.trim() || !keyMaterial.trim()}
            >
              {busy === 'upload-manual' ? <span className="spinner" /> : null}
              Upload key
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
