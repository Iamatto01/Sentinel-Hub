'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Empty, ErrorAlert, Loading } from './ui';
import { PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { formatBytes, formatNumber, timeAgo } from './format';
import type { ProjectKind, ProjectSummary, ScanResult } from '@/lib/projects';
import { aggregateState, hubProcessName } from '@/lib/project-runtime-core';
import { LOGO_CATALOG } from './KaliServerView';
import { apiPost } from './api';

const KIND_ORDER: ProjectKind[] = ['website', 'bot', 'service', 'library', 'data', 'other'];

const KIND_TONE: Record<ProjectKind, string> = {
  website: 'blue',
  bot: 'violet',
  service: 'green',
  library: 'grey',
  data: 'amber',
  other: 'grey',
};

function GitChip({ project }: { project: ProjectSummary }) {
  const { git } = project;
  if (!git.isRepo) return <span className="badge grey">no git</span>;

  const dirty = git.changedFiles > 0;
  return (
    <>
      <span className={`badge ${dirty ? 'amber' : 'green'}`}>
        <span className="dot" />
        {dirty ? `${formatNumber(git.changedFiles)} changed` : 'clean'}
      </span>
      {git.branch ? <span className="chip mono truncate">{git.branch}</span> : null}
      {git.remoteSlug ? (
        <span className="chip mono truncate">{git.remoteSlug}</span>
      ) : (
        <span className="badge amber">no remote</span>
      )}
      {git.ahead > 0 ? <span className="badge blue">{formatNumber(git.ahead)} ahead</span> : null}
      {git.behind > 0 ? <span className="badge violet">{formatNumber(git.behind)} behind</span> : null}
    </>
  );
}

const RUNTIME_TONE: Record<string, string> = {
  online: 'green',
  stopped: 'grey',
  errored: 'red',
  'not-managed': 'grey',
};

const RUNTIME_LABEL: Record<string, string> = {
  online: 'online',
  stopped: 'stopped',
  errored: 'errored',
  'not-managed': 'not managed',
};

function runtimeTone(state: string): string {
  return RUNTIME_TONE[state] ?? 'grey';
}

/**
 * Run/stop/restart controls for one project, rendered as a sibling of the tile
 * `<Link>` rather than inside it.
 *
 * Nesting these buttons would place interactive elements inside a link, so the
 * anchor would swallow the tap; placing them outside means a click can never
 * navigate to the project page by accident.
 */
function RuntimeControl({
  project,
  busyKey,
  onRun,
}: {
  project: ProjectSummary;
  busyKey: string | null;
  onRun: (project: ProjectSummary, action: 'start' | 'stop' | 'restart') => void;
}) {
  const runtimes = project.runtime ?? [];
  const state = aggregateState(runtimes);
  const managed = runtimes.length > 0;
  const selfManaged = runtimes.some((runtime) => runtime.processName === hubProcessName());
  // Any in-flight action blocks every control, so two projects cannot be
  // mutated concurrently from a stray double-click.
  const working = busyKey !== null;
  const isBusy = working && busyKey.startsWith(`${project.name}:`);
  const targets = runtimes.map((runtime) => runtime.processName).join(', ');

  return (
    <div className="tile-controls">
      <span className={`badge ${runtimeTone(state)}`} title={runtimes.map((r) => r.processName).join(', ') || undefined}>
        <span className="dot" />
        {RUNTIME_LABEL[state] ?? state}
      </span>
      {managed && runtimes.length > 1 ? <span className="chip mono">{runtimes.length} procs</span> : null}
      <span style={{ flex: 1 }} />
      {project.webUrl ? (
        <a
          href={project.webUrl}
          target="_blank"
          rel="noreferrer"
          className="btn sm"
          style={{
            textDecoration: 'none',
            color: '#38bdf8',
            borderColor: 'rgba(56, 189, 248, 0.35)',
            background: 'rgba(56, 189, 248, 0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 500,
          }}
          title={`Open live URL: ${project.webUrl}`}
        >
          Open ↗
        </a>
      ) : null}
      {project.git.remoteSlug ? (
        <a
          href={`https://github.com/${project.git.remoteSlug}`}
          target="_blank"
          rel="noreferrer"
          className="btn sm ghost"
          style={{
            textDecoration: 'none',
            color: 'var(--text-dim)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
          title={`GitHub: https://github.com/${project.git.remoteSlug}`}
        >
          Repo ↗
        </a>
      ) : null}
      {selfManaged ? (
        <span className="faint nowrap" style={{ fontSize: 11 }} title="This is the dashboard's own process">
          self
        </span>
      ) : null}
      <button
        type="button"
        className="btn sm"
        disabled={!managed || working || selfManaged}
        onClick={() => onRun(project, state === 'online' ? 'restart' : 'start')}
        title={
          !managed
            ? 'No PM2 process is bound to this project'
            : selfManaged
              ? 'Refused: this process serves the dashboard'
              : `${state === 'online' ? 'Restart' : 'Start'} ${targets}`
        }
      >
        {isBusy ? <span className="spinner" /> : null}
        {state === 'online' ? 'Restart' : 'Start'}
      </button>
      <button
        type="button"
        className="btn sm danger"
        disabled={!managed || working || selfManaged || state !== 'online'}
        onClick={() => onRun(project, 'stop')}
        title={!managed ? 'No PM2 process is bound to this project' : `Stop ${targets}`}
      >
        Stop
      </button>
    </div>
  );
}

/** The navigable body of a project tile: logo, name, git chips and sizes. */
function ProjectTileBody({ project }: { project: ProjectSummary }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {project.logoUrl ? (
          <img
            src={project.logoUrl}
            alt={project.name}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '7px',
              objectFit: 'contain',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--line)',
              padding: '2px',
              flexShrink: 0,
            }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '7px',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0,
            }}
          >
            📁
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tile-title" style={{ marginBottom: '2px' }}>
            <span className="truncate">{project.name}</span>
            <span className={`badge ${KIND_TONE[project.kind]}`}>{project.kind}</span>
          </div>
          <div className="faint truncate" style={{ fontSize: 11.5, minHeight: 14 }}>
            {project.description ?? project.framework ?? project.path}
          </div>
        </div>
      </div>
      <div className="tile-meta">
        <GitChip project={project} />
        {project.webUrl ? (
          <span
            className="chip mono truncate"
            style={{
              color: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.06)',
            }}
            title={project.webUrl}
          >
            {project.webUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '')}
          </span>
        ) : null}
        {project.scripts.length > 0 ? <span className="chip">{formatNumber(project.scripts.length)} scripts</span> : null}
        {project.hasEnvFile ? <span className="chip amber">.env</span> : null}
      </div>
      <div className="tile-foot faint" style={{ fontSize: 11.5 }}>
        <span>{formatBytes(project.totalBytes)}</span>
        <span>·</span>
        <span>modified {timeAgo(project.modifiedAt)}</span>
        {project.git.lastCommit ? (
          <>
            <span>·</span>
            <span className="mono truncate">{project.git.lastCommit.hash.slice(0, 7)}</span>
          </>
        ) : null}
      </div>
    </>
  );
}

export default function ProjectsView({ embedded = false }: { embedded?: boolean } = {}) {
  const scan = usePoll<ScanResult>('/api/projects', 45_000);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ProjectKind>('all');
  const [onlyDirty, setOnlyDirty] = useState(false);
  const [showLogoCatalog, setShowLogoCatalog] = useState(false);
  const rescan = useAction(() => scan.refresh());
  const projectAction = useAction(() => scan.refresh());

  const projects = scan.data?.projects ?? [];

  /**
   * Runs a lifecycle action against one project.
   *
   * `useAction` only permits one mutation at a time and the key includes the
   * project name, which is what lets the matching tile show a spinner while
   * every other tile's controls stay disabled.
   */
  const runProjectAction = (project: ProjectSummary, action: 'start' | 'stop' | 'restart') => {
    void projectAction.run(`${project.name}:${action}`, async () => {
      const envelope = await apiPost<{ successes: number; failures: number; steps: { processName: string; ok: boolean; output: string }[] }>(
        `/api/projects/${encodeURIComponent(project.name)}/action`,
        { action },
      );
      const result = envelope.data;
      const failed = result.steps.filter((step) => !step.ok);
      // A partial fan-out is reported as a partial success, never rounded up to
      // "done" — the operator needs to know which process is still down.
      if (failed.length > 0) {
        return `${project.name}: ${action}ed ${result.successes} process(es); ${failed
          .map((step) => `${step.processName} failed`)
          .join(', ')}`;
      }
      return `${project.name}: ${action} ok (${result.successes} process${result.successes === 1 ? '' : 'es'})`;
    });
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (kind !== 'all' && project.kind !== kind) return false;
      if (onlyDirty && !(project.git.isRepo && project.git.changedFiles > 0)) return false;
      if (!needle) return true;
      return (
        project.name.toLowerCase().includes(needle) ||
        (project.framework ?? '').toLowerCase().includes(needle) ||
        (project.description ?? '').toLowerCase().includes(needle) ||
        (project.git.remoteSlug ?? '').toLowerCase().includes(needle)
      );
    });
  }, [projects, query, kind, onlyDirty]);

  const bodyContent = (
    <>
      <ErrorAlert error={scan.error} onRetry={scan.refresh} />
      <ErrorAlert error={rescan.error} />
      <ErrorAlert error={projectAction.error} onRetry={projectAction.clearError} />
      {projectAction.notice ? (
        <div className="alert ok" role="status">
          {projectAction.notice}
        </div>
      ) : null}

      {scan.data && !scan.data.rootExists ? (
        <div className="alert warn">
          <span>
            The project root <code className="mono">{scan.data.root}</code> does not exist on this host. Set{' '}
            <code className="mono">HUB_PROJECTS_ROOT</code> to the directory that holds your projects and restart the
            service.
          </span>
        </div>
      ) : null}

      <Card flush={false}>
        <div className="row">
          <input
            className="input search"
            type="search"
            placeholder="Search name, framework, remote…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search projects"
          />
          <select
            className="select"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'all' | ProjectKind)}
            aria-label="Filter by kind"
          >
            <option value="all">All kinds</option>
            {KIND_ORDER.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={onlyDirty ? 'btn sm primary' : 'btn sm ghost'}
            onClick={() => setOnlyDirty((value) => !value)}
            aria-pressed={onlyDirty}
          >
            Uncommitted only
          </button>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setShowLogoCatalog(true)}
            title="Open Sentinel 20-Logo Master Reference Catalog"
          >
            🎨 Logo Catalog
          </button>
          {embedded && (
            <button
              type="button"
              className="btn sm"
              onClick={() => void rescan.run('rescan', async () => {
                await fetch('/api/projects', { method: 'POST', credentials: 'same-origin' });
                scan.refresh();
                return 'Cache cleared, rescanning';
              })}
              disabled={rescan.busy !== null || scan.loading}
              title="Rescan projects directory"
            >
              {rescan.busy || scan.loading ? <span className="spinner" /> : null}
              Rescan
            </button>
          )}
          <span className="topbar-spacer" />
          <span className="faint nowrap" style={{ fontSize: 12 }}>
            {formatNumber(filtered.length)} of {formatNumber(projects.length)}
          </span>
        </div>
      </Card>

      {scan.loading && !scan.data ? (
        <Card>
          <Loading label="Scanning the project root…" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Empty title="No projects match">
            {projects.length === 0
              ? 'The scanner found no project directories. Check the project root and rescan.'
              : 'Adjust the search text or filters to widen the result set.'}
          </Empty>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((project) => {
            const runtimes = project.runtime ?? [];
            const state = aggregateState(runtimes);
            const isOnline = state === 'online';
            const managed = runtimes.length > 0;
            const selfManaged = runtimes.some((runtime) => runtime.processName === hubProcessName());
            const isBusy = projectAction.busy?.startsWith(`${project.name}:`);

            return (
              <div
                key={project.path}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line-soft)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 1.4fr) minmax(220px, 1.2fr) minmax(220px, auto)',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: 'var(--glass-shadow)',
                }}
              >
                {/* 1. Identity: pulse-dot + Logo + Title & Live URL + Description/Path */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span
                    className={`pulse-dot ${isOnline ? 'green' : managed ? 'amber' : 'grey'}`}
                    style={{ width: '9px', height: '9px', flexShrink: 0 }}
                  />
                  {project.logoUrl ? (
                    <img
                      src={project.logoUrl}
                      alt={project.name}
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '9px',
                        objectFit: 'contain',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--line)',
                        padding: '3px',
                        flexShrink: 0,
                      }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '9px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0,
                      }}
                    >
                      📁
                    </div>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <Link
                        href={`/projects/${encodeURIComponent(project.name)}`}
                        style={{
                          fontSize: '14.5px',
                          fontWeight: 650,
                          color: 'var(--text)',
                          textDecoration: 'none',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {project.name}
                      </Link>
                      <span className={`badge ${KIND_TONE[project.kind] ?? 'grey'}`}>{project.kind}</span>
                      {project.webUrl && (
                        <a
                          href={project.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '11px',
                            color: 'var(--text)',
                            textDecoration: 'none',
                            background: 'var(--panel-2)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--line)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 500,
                          }}
                          title={`Open live site: ${project.webUrl}`}
                        >
                          <span>{project.webUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span> ↗
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }} className="truncate">
                      {project.description ?? project.framework ?? project.path}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                      <span className="app-tag">{formatBytes(project.totalBytes)}</span>
                      {project.hasEnvFile && <span className="app-tag amber">.env</span>}
                      {project.scripts.length > 0 && (
                        <span className="app-tag">{project.scripts.length} scripts</span>
                      )}
                      <span className="app-tag" style={{ color: 'var(--text-faint)' }}>
                        modified {timeAgo(project.modifiedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Git & Status Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <GitChip project={project} />
                  </div>
                  {project.git.lastCommit && (
                    <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }} className="truncate">
                      commit {project.git.lastCommit.hash.slice(0, 7)}: {project.git.lastCommit.subject}
                    </div>
                  )}
                  {managed && (
                    <div style={{ fontSize: '11.5px', color: isOnline ? '#10b981' : 'var(--text-dim)' }}>
                      ● {isOnline ? 'Online (PM2)' : 'Stopped (PM2)'}
                      {runtimes.length > 1 ? ` · ${runtimes.length} processes` : ''}
                    </div>
                  )}
                </div>

                {/* 3. Action Buttons Column (Open Web, GitHub, Power, Details) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                  {project.webUrl && (
                    <a
                      href={project.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn sm"
                      style={{
                        textDecoration: 'none',
                        color: 'var(--text)',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line)',
                        fontWeight: 550,
                      }}
                      title={`Open live site: ${project.webUrl}`}
                    >
                      Open Web ↗
                    </a>
                  )}

                  {project.git.remoteSlug && (
                    <a
                      href={`https://github.com/${project.git.remoteSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn sm ghost"
                      style={{
                        textDecoration: 'none',
                        color: 'var(--text-dim)',
                        border: '1px solid var(--line)',
                      }}
                      title={`GitHub: https://github.com/${project.git.remoteSlug}`}
                    >
                      GitHub ↗
                    </a>
                  )}

                  {managed && !selfManaged && (
                    <>
                      <button
                        type="button"
                        className={isOnline ? 'btn-power-off' : 'btn-power-on'}
                        onClick={() => runProjectAction(project, isOnline ? 'stop' : 'start')}
                        disabled={projectAction.busy !== null}
                        title={isOnline ? `Stop ${project.name}` : `Start ${project.name}`}
                        style={{ minWidth: '72px' }}
                      >
                        <span className={isBusy ? 'spinning' : ''}>{isOnline ? '🟢' : '⚪'}</span>
                        <span>{isBusy ? '…' : isOnline ? 'ON' : 'OFF'}</span>
                      </button>

                      <button
                        type="button"
                        className={`btn-restart ${isBusy ? 'busy' : ''}`}
                        onClick={() => runProjectAction(project, 'restart')}
                        disabled={projectAction.busy !== null}
                        title={`Restart ${project.name}`}
                      >
                        <span>🔄</span>
                      </button>
                    </>
                  )}

                  {selfManaged && (
                    <span className="badge blue" title="Serves the Hub dashboard itself">
                      Hub Daemon
                    </span>
                  )}

                  <Link
                    href={`/projects/${encodeURIComponent(project.name)}`}
                    className="btn sm ghost"
                    style={{ textDecoration: 'none', border: '1px solid var(--line)' }}
                    title="View project details, files and git log"
                  >
                    Details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Projects"
          subtitle={scan.data ? `${formatNumber(projects.length)} project(s) discovered under ${scan.data.root}` : 'Discovering local projects'}
          syncedAt={scan.generatedAt}
        >
          <button
            type="button"
            className="btn sm"
            onClick={() => void rescan.run('rescan', async () => {
              await fetch('/api/projects', { method: 'POST', credentials: 'same-origin' });
              scan.refresh();
              return 'Cache cleared, rescanning';
            })}
            disabled={rescan.busy !== null || scan.loading}
          >
            {rescan.busy || scan.loading ? <span className="spinner" /> : null}
            Rescan
          </button>
        </PageHeader>
      )}

      {/* 20 Logos Reference Catalog Modal */}
      {showLogoCatalog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              background: '#0d1322',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '1060px',
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '94%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0, 240, 255, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--line)', paddingBottom: '14px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🎨</span> Sentinel 20-Logo Master Catalog & Reference
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Extracted from <code className="mono">logo 1.jpg</code> & <code className="mono">logo 2.jpg</code> &bull; Assigned to projects and available for reference
                </div>
              </div>
              <button
                type="button"
                className="btn-sync-now"
                onClick={() => setShowLogoCatalog(false)}
                style={{ padding: '6px 14px', fontSize: '13px' }}
              >
                ✕ Close
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '14px',
              }}
            >
              {LOGO_CATALOG.map((logo) => (
                <div
                  key={logo.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      width: '90px',
                      height: '90px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px',
                    }}
                  >
                    <img
                      src={`/logos/${logo.filename}`}
                      alt={logo.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logos_transparent/' + logo.filename;
                      }}
                    />
                  </div>
                  <div>
                    <span className="app-tag" style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.1)', color: '#38bdf8' }}>
                      {logo.id} &bull; {logo.category}
                    </span>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#fff', marginTop: '4px' }}>
                      {logo.name}
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>
                      {logo.domain}
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', width: '100%', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 500 }}>
                      ✓ Assigned: {logo.assignedProject}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {embedded ? bodyContent : <PageBody>{bodyContent}</PageBody>}
    </>
  );
}
