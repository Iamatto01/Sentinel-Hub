'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, Stat, Tabs } from './ui';
import { PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { apiDelete, apiPost } from './api';
import { formatBytes, formatNumber, timeAgo } from './format';
import type { GithubOrg, GithubRepo, GithubRepoAuditResult, GithubSshKey, GithubUser } from '@/lib/github';
import GithubAiLoopModal from './GithubAiLoopModal';

interface GithubOverview {
  configured: true;
  user: GithubUser;
  username: string | null;
  scopes: string[];
  repos: GithubRepo[];
  orgs: GithubOrg[];
  localBySlug: Record<string, string>;
  localWebUrlBySlug?: Record<string, string>;
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
  { id: 'repos', label: 'Repositories & Projects' },
  { id: 'keys', label: 'SSH Deploy Keys' },
];

const REQUIRED_SCOPES = ['repo', 'read:user', 'admin:public_key'];

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  Shell: '#89e051',
  C: '#555555',
  'C++': '#f34b7d',
  PHP: '#4F5D95',
  Java: '#b07219',
};

function getLanguageColor(lang: string | null): string {
  if (!lang) return '#888';
  return LANGUAGE_COLORS[lang] ?? '#6366f1';
}

function resolveLiveUrl(repo: GithubRepo, localWebUrl?: string): string | null {
  if (localWebUrl) return localWebUrl;
  if (repo.homepage && repo.homepage.startsWith('http')) return repo.homepage;
  if (repo.hasPages) return `https://${repo.owner.login}.github.io/${repo.name}`;

  const lower = repo.name.toLowerCase();
  if (lower.includes('tree')) return 'https://tree.sentinelai.studio';
  if (lower.includes('along')) return 'https://along.sentinelai.studio';
  if (lower.includes('master') || lower.includes('hub')) return 'https://hub.sentinelai.studio';
  if (lower.includes('9router') || lower.includes('router')) return 'https://router.sentinelai.studio';
  if (lower.includes('fame')) return 'https://hall-of-fame.sentinelai.studio';

  return null;
}

export default function GithubView() {
  const [tab, setTab] = useState('repos');
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'cloud'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Token Connection Modal state
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [showTokenSecret, setShowTokenSecret] = useState(false);
  const [connectingToken, setConnectingToken] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Live Preview Modal state
  const [previewRepo, setPreviewRepo] = useState<GithubRepo | null>(null);
  const [previewTab, setPreviewTab] = useState<'live' | 'readme' | 'files'>('live');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [repoFiles, setRepoFiles] = useState<Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }>>([]);
  const [loadingPreviewData, setLoadingPreviewData] = useState(false);

  // Security Audit Modal state
  const [auditTarget, setAuditTarget] = useState<GithubRepo | null>(null);
  const [auditResult, setAuditResult] = useState<GithubRepoAuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);

  // AI Intel Drawer state
  const [intelRepo, setIntelRepo] = useState<GithubRepo | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelAnalysis, setIntelAnalysis] = useState<string | null>(null);

  // Autonomous AI Loop state
  const [aiLoopTarget, setAiLoopTarget] = useState<GithubRepo | null>(null);
  const [aiLoopLocalProject, setAiLoopLocalProject] = useState<string | undefined>(undefined);

  // Sync state
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  // Keys tab state
  const [keyTitle, setKeyTitle] = useState('');
  const [keyMaterial, setKeyMaterial] = useState('');

  const github = usePoll<GithubPayload>('/api/github', 60_000);
  const keys = usePoll<KeysPayload>('/api/github/keys', 0);
  const action = useAction(() => {
    keys.refresh();
  });

  const overview = github.data?.configured === true ? github.data : null;
  const unconfigured = github.data?.configured === false ? github.data : null;

  // Filter organizations & accounts list
  const orgList = useMemo(() => {
    if (!overview) return [];
    const list: Array<{ id: string; label: string; avatarUrl?: string; isOrg: boolean }> = [
      { id: 'all', label: 'All Repositories', isOrg: false },
      { id: overview.user.login.toLowerCase(), label: `@${overview.user.login} (Personal)`, avatarUrl: overview.user.avatarUrl, isOrg: false },
    ];
    for (const org of overview.orgs || []) {
      list.push({
        id: org.login.toLowerCase(),
        label: `@${org.login}`,
        avatarUrl: org.avatarUrl,
        isOrg: true,
      });
    }
    return list;
  }, [overview]);

  // Filtered repositories
  const filteredRepos = useMemo(() => {
    if (!overview) return [];
    let list = overview.repos;

    // Filter by Organization
    if (selectedOrg !== 'all') {
      list = list.filter((r) => r.owner.login.toLowerCase() === selectedOrg);
    }

    // Filter by Privacy
    if (filterPrivacy === 'public') list = list.filter((r) => !r.private);
    if (filterPrivacy === 'private') list = list.filter((r) => r.private);

    // Filter by Linked status
    if (filterLinked === 'linked') {
      list = list.filter((r) => Boolean(overview.localBySlug[r.fullName.toLowerCase()]));
    } else if (filterLinked === 'cloud') {
      list = list.filter((r) => !overview.localBySlug[r.fullName.toLowerCase()]);
    }

    // Filter by Search Query
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (repo) =>
          repo.name.toLowerCase().includes(needle) ||
          repo.fullName.toLowerCase().includes(needle) ||
          (repo.description ?? '').toLowerCase().includes(needle) ||
          (repo.language ?? '').toLowerCase().includes(needle) ||
          repo.topics.some((topic) => topic.toLowerCase().includes(needle)),
      );
    }

    return list;
  }, [overview, selectedOrg, filterPrivacy, filterLinked, query]);

  const scopes = overview?.scopes ?? [];
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));

  // Connect GitHub Token
  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;
    setConnectingToken(true);
    setConnectError(null);

    try {
      const res = await apiPost<{ success: boolean; user: GithubUser; scopes: string[]; message: string }>(
        '/api/github',
        { token: inputToken.trim() },
      );
      if (res.data?.success) {
        setShowTokenDialog(false);
        setInputToken('');
        github.refresh();
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect token');
    } finally {
      setConnectingToken(false);
    }
  };

  // Open Live Preview
  const handleOpenPreview = async (repo: GithubRepo) => {
    setPreviewRepo(repo);
    const liveUrl = resolveLiveUrl(repo, overview?.localWebUrlBySlug?.[repo.fullName.toLowerCase()]);
    setPreviewTab(liveUrl ? 'live' : 'readme');
    setLoadingPreviewData(true);
    setReadmeContent(null);
    setRepoFiles([]);

    try {
      const res = await fetch(`/api/github/preview?owner=${encodeURIComponent(repo.owner.login)}&name=${encodeURIComponent(repo.name)}`);
      if (res.ok) {
        const json = await res.json();
        setReadmeContent(json.data?.readme ?? 'No README.md documentation available for this repository.');
        setRepoFiles(json.data?.files ?? []);
      }
    } catch {
      setReadmeContent('Could not fetch repository files or documentation.');
    } finally {
      setLoadingPreviewData(false);
    }
  };

  // Trigger Security Audit
  const handleRunAudit = async (repo: GithubRepo) => {
    setAuditTarget(repo);
    setAuditing(true);
    setAuditResult(null);

    try {
      const res = await apiPost<GithubRepoAuditResult>('/api/github/audit', {
        owner: repo.owner.login,
        name: repo.name,
      });
      setAuditResult(res.data);
    } catch (err) {
      setAuditResult({
        score: 40,
        grade: 'F',
        summary: `Audit execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        checks: [{ id: 'err', name: 'Audit Probe', status: 'fail', detail: String(err) }],
        recommendations: ['Check token permissions and network connectivity.'],
        auditedAt: new Date().toISOString(),
      });
    } finally {
      setAuditing(false);
    }
  };

  // Trigger Sync / Update
  const handleSync = async (repo: GithubRepo) => {
    const localProj = overview?.localBySlug[repo.fullName.toLowerCase()];
    setSyncingRepo(repo.fullName);
    setSyncStatus(null);

    try {
      const res = await apiPost<{ success: boolean; message: string; branch?: string; commit?: string }>(
        '/api/github/sync',
        {
          owner: repo.owner.login,
          name: repo.name,
          localProject: localProj,
        },
      );
      setSyncStatus({
        id: repo.fullName,
        msg: res.data?.message || 'Updated successfully',
        ok: res.data?.success !== false,
      });
      github.refresh();
    } catch (err) {
      setSyncStatus({
        id: repo.fullName,
        msg: err instanceof Error ? err.message : 'Sync failed',
        ok: false,
      });
    } finally {
      setSyncingRepo(null);
    }
  };

  // Generate AI Intel
  const handleGenerateIntel = async (repo: GithubRepo) => {
    setIntelRepo(repo);
    setIntelLoading(true);
    setIntelAnalysis(null);

    try {
      const res = await apiPost<{ reply: string }>('/api/hermes/chat', {
        message: `Analyze this GitHub repository for Jack:
Repository: ${repo.fullName}
Description: ${repo.description || 'None'}
Language: ${repo.language || 'Unknown'}
Stars: ${repo.stars}, Forks: ${repo.forks}, Open Issues: ${repo.openIssues}
Default Branch: ${repo.defaultBranch}
Topics: ${repo.topics.join(', ') || 'None'}

Provide a 3-part intelligence briefing:
1. Executive Technical Summary (Architecture & purpose)
2. Stack & Key Dependencies Insights
3. Sentinel Hub Deployment & Defensive Recommendations. Keep it concise, high-IQ, and actionable.`,
      });
      setIntelAnalysis(res.data?.reply || 'Analysis completed.');
    } catch (err) {
      setIntelAnalysis(`AI analysis unavailable: ${err instanceof Error ? err.message : 'Router offline'}`);
    } finally {
      setIntelLoading(false);
    }
  };

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
        title="GitHub Integration"
        subtitle="Manage cloud & local repositories, organizations, live previews, and automated security audits"
        syncedAt={github.generatedAt}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {overview && overview.repos.length > 0 && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                const target = filteredRepos[0] || overview.repos[0];
                if (target) {
                  setAiLoopTarget(target);
                  setAiLoopLocalProject(overview.localBySlug[target.fullName.toLowerCase()]);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(192, 132, 252, 0.22))',
                color: '#38bdf8',
                borderColor: 'rgba(56, 189, 248, 0.45)',
                fontWeight: 650,
              }}
              title="Launch Autonomous AI Loop for repository"
            >
              ⚡ AI Loop
            </button>
          )}
          {overview && (
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setShowTokenDialog(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-1.5 1.5L16 7m-1.5 1.5L13 10m-1.5 1.5L10 13m-1.5 1.5L7 16m-1.5 1.5L4 19m-2 2l2-2" />
                <circle cx="15.5" cy="8.5" r="5.5" />
              </svg>
              Change Token
            </button>
          )}
          <button type="button" className="btn sm" onClick={github.refresh} disabled={github.loading}>
            {github.loading ? <span className="spinner" /> : null}
            Refresh
          </button>
        </div>
      </PageHeader>

      <PageBody>
        <ErrorAlert error={github.error} onRetry={github.refresh} />
        <ErrorAlert error={action.error} />
        {action.notice ? <div className="alert ok">{action.notice}</div> : null}

        {syncStatus && (
          <div className={`alert ${syncStatus.ok ? 'ok' : 'err'}`} style={{ marginBottom: '16px' }}>
            <strong>{syncStatus.id}:</strong> {syncStatus.msg}
          </div>
        )}

        {/* Not Configured OR Connect Prompt */}
        {(unconfigured || showTokenDialog) && (
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#38bdf8',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 650 }}>
                      {overview ? 'Update GitHub Token' : 'Connect GitHub Integration'}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                      Masukkan GitHub Personal Access Token (PAT) atau OAuth token anda untuk menyambung akaun, organisasi, dan repositori.
                    </p>
                  </div>
                </div>
              </div>

              {overview && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setShowTokenDialog(false)}
                  style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleConnectToken} style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showTokenSecret ? 'text' : 'password'}
                    className="input"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_xxxxxxxx..."
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    required
                    style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '13px', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTokenSecret(!showTokenSecret)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-faint)',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {showTokenSecret ? 'Hide' : 'Show'}
                  </button>
                </div>

                <button type="submit" className="btn primary" disabled={connectingToken || !inputToken.trim()}>
                  {connectingToken ? <span className="spinner" /> : null}
                  {connectingToken ? 'Verifying...' : 'Connect GitHub'}
                </button>
              </div>

              {connectError && (
                <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#ef4444' }}>
                  ⚠️ {connectError}
                </div>
              )}

              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 14px',
                  background: 'var(--panel-2)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  border: '1px solid var(--line-soft)',
                }}
              >
                <span>
                  💡 <strong>Keperluan Scope:</strong> Pastikan token mempunyai scope <code className="mono">repo</code>,{' '}
                  <code className="mono">read:user</code>, <code className="mono">read:org</code>, dan{' '}
                  <code className="mono">admin:public_key</code>.
                </span>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user,read:org,admin:public_key&description=SentinelHubIntegration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn sm"
                  style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Generate Token ↗
                </a>
              </div>
            </form>
          </div>
        )}

        {github.loading && !github.data ? (
          <Card>
            <Loading label="Contacting GitHub API…" />
          </Card>
        ) : null}

        {overview ? (
          <>
            {/* Top Stats Overview */}
            <div className="grid cols-4" style={{ marginBottom: '20px' }}>
              <Stat
                label="Connected Account"
                value={overview.user.login}
                foot={overview.user.name ?? overview.user.htmlUrl}
              />
              <Stat
                label="Repositories"
                value={formatNumber(overview.repos.length)}
                foot={`${formatNumber(overview.repos.filter((r) => r.private).length)} private · ${formatNumber(overview.repos.filter((r) => !r.private).length)} public`}
              />
              <Stat
                label="Organizations"
                value={formatNumber(overview.orgs?.length ?? 0)}
                foot={`${formatNumber(Object.keys(overview.localBySlug).length)} linked to local projects`}
              />
              <Stat
                label="Token Health"
                value={`${scopes.length} Scopes`}
                foot={missingScopes.length > 0 ? `missing: ${missingScopes.join(', ')}` : 'all required scopes verified'}
              />
            </div>

            {missingScopes.length > 0 && (
              <Alert kind="warn">
                Token is missing scope(s): <code className="mono">{missingScopes.join(', ')}</code>. Some management and push features may be restricted.
              </Alert>
            )}

            <Tabs items={TABS} active={tab} onChange={setTab} />

            {tab === 'repos' && (
              <div style={{ marginTop: '16px' }}>
                {/* Organization & Account Switcher Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    overflowX: 'auto',
                    paddingBottom: '10px',
                    marginBottom: '16px',
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-faint)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Workspace:
                  </span>
                  {orgList.map((item) => {
                    const active = selectedOrg === item.id;
                    const count =
                      item.id === 'all'
                        ? overview.repos.length
                        : overview.repos.filter((r) => r.owner.login.toLowerCase() === item.id).length;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedOrg(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          fontWeight: active ? 650 : 500,
                          background: active ? 'var(--panel-3)' : 'transparent',
                          color: active ? 'var(--text)' : 'var(--text-dim)',
                          border: active ? '1px solid var(--line-focus)' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.avatarUrl && (
                          <img
                            src={item.avatarUrl}
                            alt=""
                            style={{ width: '16px', height: '16px', borderRadius: '4px' }}
                          />
                        )}
                        <span>{item.label}</span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            padding: '1px 5px',
                            borderRadius: '999px',
                            background: active ? 'var(--accent)' : 'var(--panel-2)',
                            color: active ? '#fff' : 'var(--text-faint)',
                            fontWeight: 600,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search, Filter & View Controls */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                    <input
                      type="text"
                      className="input search"
                      placeholder="Search repositories by name, topic, or language..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{ width: '100%', maxWidth: '420px', fontSize: '13px' }}
                    />

                    {/* Filter by Privacy */}
                    <select
                      className="input"
                      value={filterPrivacy}
                      onChange={(e) => setFilterPrivacy(e.target.value as any)}
                      style={{ fontSize: '12.5px', padding: '6px 10px', width: 'auto' }}
                    >
                      <option value="all">All Visibility</option>
                      <option value="public">Public only</option>
                      <option value="private">Private only</option>
                    </select>

                    {/* Filter by Linked */}
                    <select
                      className="input"
                      value={filterLinked}
                      onChange={(e) => setFilterLinked(e.target.value as any)}
                      style={{ fontSize: '12.5px', padding: '6px 10px', width: 'auto' }}
                    >
                      <option value="all">All Locations</option>
                      <option value="linked">Linked to Server</option>
                      <option value="cloud">Cloud Only</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                      Showing {filteredRepos.length} of {overview.repos.length}
                    </span>

                    <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`btn sm ${viewMode === 'grid' ? 'primary' : 'ghost'}`}
                        style={{ borderRadius: 0, padding: '4px 9px' }}
                        title="Grid View (Project Cards)"
                      >
                        ⊞
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`btn sm ${viewMode === 'table' ? 'primary' : 'ghost'}`}
                        style={{ borderRadius: 0, padding: '4px 9px' }}
                        title="Table View"
                      >
                        ≡
                      </button>
                    </div>
                  </div>
                </div>

                {filteredRepos.length === 0 ? (
                  <Card>
                    <Empty title="No repositories match the current filters">
                      Try adjusting your search terms or workspace tab.
                    </Empty>
                  </Card>
                ) : viewMode === 'grid' ? (
                  /* Project-Style Cards Grid */
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    {filteredRepos.map((repo) => {
                      const localProj = overview.localBySlug[repo.fullName.toLowerCase()];
                      const localWebUrl = overview.localWebUrlBySlug?.[repo.fullName.toLowerCase()];
                      const liveUrl = resolveLiveUrl(repo, localWebUrl);
                      const isSyncing = syncingRepo === repo.fullName;

                      return (
                        <div
                          key={repo.id}
                          style={{
                            background: 'var(--panel)',
                            border: '1px solid var(--line)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px',
                            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                          }}
                          className="hover-card"
                        >
                          {/* Card Top: Avatar, Name, Badges */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                <img
                                  src={repo.owner.avatarUrl}
                                  alt=""
                                  style={{ width: '22px', height: '22px', borderRadius: '5px', flexShrink: 0 }}
                                />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <a
                                    href={repo.htmlUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    style={{
                                      fontSize: '14.5px',
                                      fontWeight: 650,
                                      color: 'var(--text)',
                                      textDecoration: 'none',
                                      display: 'block',
                                    }}
                                    className="truncate"
                                    title={repo.fullName}
                                  >
                                    {repo.name}
                                  </a>
                                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                                    {repo.owner.login}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Badge tone={repo.private ? 'violet' : 'grey'}>
                                  {repo.private ? 'private' : 'public'}
                                </Badge>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontFamily: 'var(--mono)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--panel-2)',
                                    color: 'var(--text-dim)',
                                    border: '1px solid var(--line-soft)',
                                  }}
                                >
                                  {repo.defaultBranch}
                                </span>
                              </div>
                            </div>

                            {/* Description */}
                            <p
                              style={{
                                margin: '6px 0 10px',
                                fontSize: '12.5px',
                                color: 'var(--text-dim)',
                                lineHeight: '1.45',
                                minHeight: '36px',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {repo.description || <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No description provided</span>}
                            </p>

                            {/* Language & Metrics Strip */}
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '11.5px', color: 'var(--text-dim)' }}>
                              {repo.language && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span
                                    style={{
                                      width: '8px',
                                      height: '8px',
                                      borderRadius: '50%',
                                      background: getLanguageColor(repo.language),
                                      display: 'inline-block',
                                    }}
                                  />
                                  {repo.language}
                                </span>
                              )}

                              <span title="Stars" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                ⭐ {formatNumber(repo.stars)}
                              </span>

                              <span title="Forks" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                🍴 {formatNumber(repo.forks)}
                              </span>

                              {repo.openIssues > 0 && (
                                <span title="Open Issues" style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#eab308' }}>
                                  ⚠️ {formatNumber(repo.openIssues)}
                                </span>
                              )}

                              <span style={{ color: 'var(--text-faint)' }}>
                                {timeAgo(repo.pushedAt)}
                              </span>
                            </div>

                            {/* Local Link Status */}
                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {localProj ? (
                                <Link
                                  href={`/projects/${encodeURIComponent(localProj)}`}
                                  style={{ textDecoration: 'none' }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      color: '#10b981',
                                      border: '1px solid rgba(16, 185, 129, 0.25)',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                                    Server: {localProj}
                                  </span>
                                </Link>
                              ) : (
                                <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                                  Cloud repository
                                </span>
                              )}

                              {liveUrl && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: 'rgba(56, 189, 248, 0.1)',
                                    color: '#38bdf8',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                  }}
                                >
                                  🌐 Live App
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons Bar */}
                          <div
                            style={{
                              borderTop: '1px solid var(--line-soft)',
                              paddingTop: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {/* AI Loop Button */}
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => {
                                  setAiLoopTarget(repo);
                                  setAiLoopLocalProject(localProj);
                                }}
                                style={{
                                  fontSize: '11.5px',
                                  padding: '4px 10px',
                                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(192, 132, 252, 0.2))',
                                  color: '#38bdf8',
                                  borderColor: 'rgba(56, 189, 248, 0.45)',
                                  fontWeight: 650,
                                }}
                                title="Autonomous AI Loop: To-Do → Execute → Verify → Confirm & Publish"
                              >
                                ⚡ AI Loop
                              </button>

                              {/* Live Preview Button */}
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => handleOpenPreview(repo)}
                                style={{
                                  fontSize: '11.5px',
                                  padding: '4px 9px',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  color: '#38bdf8',
                                  borderColor: 'rgba(56, 189, 248, 0.3)',
                                }}
                                title="Open Live Preview & Code Inspector"
                              >
                                🌐 Preview
                              </button>

                              {/* Audit Button */}
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => handleRunAudit(repo)}
                                style={{
                                  fontSize: '11.5px',
                                  padding: '4px 9px',
                                  background: 'rgba(234, 179, 8, 0.12)',
                                  color: '#eab308',
                                  borderColor: 'rgba(234, 179, 8, 0.3)',
                                }}
                                title="Run Security & Code Audit"
                              >
                                🛡️ Audit
                              </button>

                              {/* Update / Sync Button */}
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => handleSync(repo)}
                                disabled={isSyncing}
                                style={{ fontSize: '11.5px', padding: '4px 9px' }}
                                title="Sync with remote git / pull updates"
                              >
                                {isSyncing ? <span className="spinner" /> : '🔄'} Update
                              </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {/* AI Intel button */}
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => handleGenerateIntel(repo)}
                                style={{ fontSize: '11.5px', padding: '4px 8px', color: '#c084fc' }}
                                title="AI Repository Architecture Intel"
                              >
                                ✨ Intel
                              </button>

                              {/* Open on GitHub */}
                              <a
                                href={repo.htmlUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="btn sm ghost"
                                style={{ fontSize: '11.5px', padding: '4px 8px', textDecoration: 'none' }}
                                title="Open on GitHub ↗"
                              >
                                ↗
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Table List View */
                  <Card flush>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Repository</th>
                          <th>Visibility</th>
                          <th>Owner / Org</th>
                          <th>Local Project</th>
                          <th>Language</th>
                          <th className="numeric">Stars</th>
                          <th className="numeric">Issues</th>
                          <th className="numeric">Size</th>
                          <th>Updated</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRepos.map((repo) => {
                          const localProj = overview.localBySlug[repo.fullName.toLowerCase()];
                          const localWebUrl = overview.localWebUrlBySlug?.[repo.fullName.toLowerCase()];
                          const liveUrl = resolveLiveUrl(repo, localWebUrl);

                          return (
                            <tr key={repo.id}>
                              <td>
                                <div className="stack" style={{ gap: 2 }}>
                                  <a href={repo.htmlUrl} target="_blank" rel="noreferrer noopener" className="truncate font-medium">
                                    {repo.name}
                                  </a>
                                  {repo.description ? <span className="faint truncate">{repo.description}</span> : null}
                                </div>
                              </td>
                              <td>
                                <Badge tone={repo.private ? 'violet' : 'grey'}>{repo.private ? 'private' : 'public'}</Badge>
                              </td>
                              <td className="nowrap dim">{repo.owner.login}</td>
                              <td className="nowrap">
                                {localProj ? (
                                  <Link href={`/projects/${encodeURIComponent(localProj)}`}>
                                    <Badge tone="green">{localProj}</Badge>
                                  </Link>
                                ) : (
                                  <span className="faint">cloud only</span>
                                )}
                              </td>
                              <td className="nowrap dim">
                                {repo.language ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getLanguageColor(repo.language) }} />
                                    {repo.language}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="numeric">{formatNumber(repo.stars)}</td>
                              <td className="numeric">{formatNumber(repo.openIssues)}</td>
                              <td className="numeric dim">{formatBytes(repo.sizeKb * 1024)}</td>
                              <td className="nowrap dim">{timeAgo(repo.pushedAt)}</td>
                              <td className="nowrap" style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '4px' }}>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => {
                                      setAiLoopTarget(repo);
                                      setAiLoopLocalProject(localProj);
                                    }}
                                    style={{
                                      padding: '2px 7px',
                                      fontSize: '11px',
                                      color: '#38bdf8',
                                      borderColor: 'rgba(56, 189, 248, 0.4)',
                                      fontWeight: 650,
                                    }}
                                    title="Autonomous AI Loop"
                                  >
                                    ⚡ Loop
                                  </button>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => handleOpenPreview(repo)}
                                    style={{ padding: '2px 7px', fontSize: '11px' }}
                                  >
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => handleRunAudit(repo)}
                                    style={{ padding: '2px 7px', fontSize: '11px', color: '#eab308' }}
                                  >
                                    Audit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn sm ghost"
                                    onClick={() => handleSync(repo)}
                                    style={{ padding: '2px 7px', fontSize: '11px' }}
                                  >
                                    Update
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>
            )}

            {/* SSH Keys Tab */}
            {tab === 'keys' && (
              <div style={{ marginTop: '16px' }} className="grid cols-2">
                <Card title="Deploy Keys on GitHub" note={`${formatNumber(keys.data?.keys.length ?? 0)} registered`} flush>
                  {keys.loading ? (
                    <Loading label="Fetching SSH deploy keys…" />
                  ) : (keys.data?.keys.length ?? 0) === 0 ? (
                    <Empty title="No SSH keys registered">
                      Upload your local public key below so Git operations can authenticate.
                    </Empty>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Added</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.data?.keys.map((k) => (
                          <tr key={k.id}>
                            <td>
                              <strong>{k.title}</strong>
                            </td>
                            <td className="nowrap dim">{timeAgo(k.createdAt)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn sm danger"
                                onClick={() => removeKey(k.id, k.title)}
                                disabled={action.busy === `delete-${k.id}`}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>

                <Card title="Add Deploy Key">
                  {keys.data?.local && (
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--panel-2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                        Local Host Public Key ({keys.data.local.algorithm})
                      </div>
                      <div style={{ fontSize: '11.5px', fontFamily: 'var(--mono)', color: 'var(--text-dim)', wordBreak: 'break-all', marginBottom: '8px' }}>
                        {keys.data.local.publicKey}
                      </div>
                      {keys.data.localAlreadyUploaded ? (
                        <Badge tone="green">Already uploaded to GitHub</Badge>
                      ) : (
                        <button
                          type="button"
                          className="btn sm primary"
                          onClick={() => uploadLocalKey(true)}
                          disabled={action.busy === 'upload-local'}
                        >
                          Upload Local Key to GitHub
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Upload Custom Key</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Key title (e.g. sentinel-kali-server)"
                      value={keyTitle}
                      onChange={(e) => setKeyTitle(e.target.value)}
                    />
                    <textarea
                      className="input mono"
                      placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5..."
                      rows={4}
                      value={keyMaterial}
                      onChange={(e) => setKeyMaterial(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() => uploadLocalKey(false)}
                      disabled={action.busy === 'upload-manual' || !keyTitle.trim() || !keyMaterial.trim()}
                    >
                      Add Custom Key
                    </button>
                  </div>
                </Card>
              </div>
            )}
          </>
        ) : null}

        {/* Live Preview Modal */}
        {previewRepo && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '1200px',
                height: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--panel-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={previewRepo.owner.avatarUrl}
                    alt=""
                    style={{ width: '28px', height: '28px', borderRadius: '6px' }}
                  />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 650 }}>{previewRepo.fullName}</h3>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-dim)' }}>
                      Branch: <code className="mono">{previewRepo.defaultBranch}</code>
                    </span>
                  </div>
                </div>

                {/* Viewport switchers for live preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      className={`btn sm ${previewTab === 'live' ? 'primary' : 'ghost'}`}
                      onClick={() => setPreviewTab('live')}
                      style={{ borderRadius: 0, fontSize: '12px' }}
                    >
                      🌐 Live Web
                    </button>
                    <button
                      type="button"
                      className={`btn sm ${previewTab === 'readme' ? 'primary' : 'ghost'}`}
                      onClick={() => setPreviewTab('readme')}
                      style={{ borderRadius: 0, fontSize: '12px' }}
                    >
                      📖 README
                    </button>
                    <button
                      type="button"
                      className={`btn sm ${previewTab === 'files' ? 'primary' : 'ghost'}`}
                      onClick={() => setPreviewTab('files')}
                      style={{ borderRadius: 0, fontSize: '12px' }}
                    >
                      📁 Files ({repoFiles.length})
                    </button>
                  </div>

                  {previewTab === 'live' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className={`btn sm ${previewViewport === 'desktop' ? 'active' : 'ghost'}`}
                        onClick={() => setPreviewViewport('desktop')}
                        title="Desktop 1280px"
                      >
                        🖥️
                      </button>
                      <button
                        type="button"
                        className={`btn sm ${previewViewport === 'tablet' ? 'active' : 'ghost'}`}
                        onClick={() => setPreviewViewport('tablet')}
                        title="Tablet 768px"
                      >
                        📱 Tablet
                      </button>
                      <button
                        type="button"
                        className={`btn sm ${previewViewport === 'mobile' ? 'active' : 'ghost'}`}
                        onClick={() => setPreviewViewport('mobile')}
                        title="Mobile 375px"
                      >
                        📱 Phone
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => setPreviewRepo(null)}
                    style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
                {previewTab === 'live' && (
                  (() => {
                    const url = resolveLiveUrl(previewRepo, overview?.localWebUrlBySlug?.[previewRepo.fullName.toLowerCase()]);
                    if (!url) {
                      return (
                        <div style={{ margin: 'auto', textAlign: 'center', padding: '40px', maxWidth: '480px' }}>
                          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🌐</div>
                          <h4 style={{ margin: '0 0 8px', fontSize: '17px' }}>No Public Live URL Deployed</h4>
                          <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                            Repositori ini belum mempunyai domain web aktif atau GitHub Pages yang dikonfigurasi. Anda boleh menyemak dokumentasi README atau struktur fail kod melalui tab di atas.
                          </p>
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => setPreviewTab('readme')}
                          >
                            Read README.md
                          </button>
                        </div>
                      );
                    }

                    const width =
                      previewViewport === 'desktop' ? '100%' : previewViewport === 'tablet' ? '768px' : '375px';

                    return (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            background: 'var(--panel-2)',
                            borderBottom: '1px solid var(--line)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                          }}
                        >
                          <span className="mono truncate" style={{ color: 'var(--text-dim)' }}>
                            URL: <a href={url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>{url}</a>
                          </span>
                          <a href={url} target="_blank" rel="noreferrer" className="btn sm ghost" style={{ fontSize: '11.5px' }}>
                            Open in New Tab ↗
                          </a>
                        </div>
                        <div style={{ flex: 1, width: '100%', display: 'flex', justifyContent: 'center', overflow: 'hidden', padding: previewViewport === 'desktop' ? 0 : '16px' }}>
                          <iframe
                            src={url}
                            title="Live Preview"
                            style={{
                              width,
                              height: '100%',
                              border: previewViewport === 'desktop' ? 'none' : '1px solid var(--line)',
                              borderRadius: previewViewport === 'desktop' ? 0 : '12px',
                              background: '#fff',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()
                )}

                {previewTab === 'readme' && (
                  <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
                    {loadingPreviewData ? (
                      <Loading label="Fetching README documentation..." />
                    ) : (
                      <pre
                        style={{
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit',
                          fontSize: '13.5px',
                          lineHeight: '1.6',
                          color: 'var(--text)',
                        }}
                      >
                        {readmeContent}
                      </pre>
                    )}
                  </div>
                )}

                {previewTab === 'files' && (
                  <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>Root Repository Files & Folders</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                      {repoFiles.map((file) => (
                        <div
                          key={file.path}
                          style={{
                            padding: '10px 12px',
                            background: 'var(--panel)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12.5px',
                          }}
                        >
                          <span>{file.type === 'dir' ? '📁' : '📄'}</span>
                          <span className="truncate mono" style={{ flex: 1 }}>{file.name}</span>
                          {file.size ? <span style={{ fontSize: '10.5px', color: 'var(--text-faint)' }}>{formatBytes(file.size)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Security Audit Modal */}
        {auditTarget && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '720px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--panel-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🛡️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 650 }}>
                      Sentinel Security Audit · {auditTarget.name}
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      Automated code hygiene, secret leak prevention, and policy verification
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setAuditTarget(null)}
                  style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                {auditing ? (
                  <Loading label="Running comprehensive repository audit..." />
                ) : auditResult ? (
                  <div>
                    {/* Score Hero */}
                    <div
                      style={{
                        padding: '18px 20px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '20px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                          Security & Posture Score
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 750, color: 'var(--text)', marginTop: '2px' }}>
                          {auditResult.score} / 100
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {auditResult.summary}
                        </div>
                      </div>

                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '16px',
                          background: auditResult.score >= 85 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          color: auditResult.score >= 85 ? '#10b981' : '#eab308',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '28px',
                          fontWeight: 800,
                          border: `2px solid ${auditResult.score >= 85 ? '#10b981' : '#eab308'}`,
                        }}
                      >
                        {auditResult.grade}
                      </div>
                    </div>

                    {/* Check items */}
                    <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 650 }}>Audit Inspection Checklist</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      {auditResult.checks.map((chk) => (
                        <div
                          key={chk.id}
                          style={{
                            padding: '10px 14px',
                            background: 'var(--panel)',
                            border: '1px solid var(--line-soft)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '12px',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                              {chk.name}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                              {chk.detail}
                            </div>
                          </div>

                          <Badge tone={chk.status === 'pass' ? 'green' : chk.status === 'warn' ? 'amber' : chk.status === 'fail' ? 'red' : 'grey'}>
                            {chk.status.toUpperCase()}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {/* Recommendations */}
                    {auditResult.recommendations.length > 0 && (
                      <div>
                        <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 650 }}>Recommendations</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                          {auditResult.recommendations.map((rec, i) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* AI Intel Drawer */}
        {intelRepo && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--panel-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>✨</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 650 }}>
                      AI Architecture Intel · {intelRepo.fullName}
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      Synthesized by Sentinel Router & Hermes Intelligence Engine
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setIntelRepo(null)}
                  style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                {intelLoading ? (
                  <Loading label="Consulting OmniRoute multi-provider models for repository architecture intel..." />
                ) : (
                  <div
                    style={{
                      fontSize: '13.5px',
                      lineHeight: '1.65',
                      color: 'var(--text)',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                    }}
                  >
                    {intelAnalysis}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Autonomous AI Loop Modal */}
        {aiLoopTarget && (
          <GithubAiLoopModal
            repo={aiLoopTarget}
            localProject={aiLoopLocalProject}
            onClose={() => {
              setAiLoopTarget(null);
              setAiLoopLocalProject(undefined);
            }}
            onPublished={(res) => {
              github.refresh();
              setSyncStatus({
                id: aiLoopTarget.fullName,
                msg: `AI Loop published successfully (${res.branch})! ${res.publishedFiles.length} file(s) updated.`,
                ok: true,
              });
            }}
          />
        )}
      </PageBody>
    </>
  );
}
