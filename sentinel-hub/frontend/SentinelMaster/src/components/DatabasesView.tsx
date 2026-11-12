'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageBody, PageHeader } from './PageHeader';
import { Alert, Badge, Card, Dot, Empty, ErrorAlert, Loading, Stat, Tabs } from './ui';
import { usePoll, useAction } from './useApi';
import { formatBytes, formatNumber, timeAgo } from './format';
import type {
  DbComparison,
  DbDiscovery,
  DbEntry,
  DbInspection,
  DbQueryResult,
  DbSnapshot,
  PostgresPayload,
} from '@/lib/db';
import SupabaseSchemaVisualizer from './SupabaseSchemaVisualizer';

interface DiscoveryPayload extends DbDiscovery {
  configured: boolean;
  reachable: boolean;
  reason?: string;
}

interface InspectionPayload extends DbInspection {
  configured?: boolean;
  reason?: string;
}

const PREVIEW_LIMIT = 50;

/**
 * Fleet-wide, read-only view of every database on the host.
 *
 * The problem this solves is specific: a project can keep a second copy of its
 * own SQLite file and quietly write to that instead of the live one, so the
 * data the operator is looking at is not the data the app is serving. Nothing
 * here ever writes — the bridge opens every file with `mode=ro` and masks
 * sensitive columns on the host, so a stray click cannot alter a database.
 */
export default function DatabasesView() {
  const params = useSearchParams();
  const discovery = usePoll<DiscoveryPayload>('/api/db', 60_000);
  const postgres = usePoll<PostgresPayload>('/api/db/postgres', 0);
  const [tab, setTab] = useState<'visualizer' | 'fleet' | 'drift' | 'postgres'>('visualizer');
  const [selected, setSelected] = useState<string | null>(null);
  const [visualizerDbId, setVisualizerDbId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const data = discovery.data;
  const groups = data?.duplicateGroups ?? [];
  const compareFile = params.get('compare');

  // Deep links from the worklist: `/databases?db=<id>` and `?compare=<file>`.
  useEffect(() => {
    const db = params.get('db');
    if (db) {
      setSelected(db);
      setVisualizerDbId(db);
    }
    if (params.get('compare')) setTab('drift');
  }, [params]);

  const primaryDb = useMemo(() => {
    const list = data?.managed ?? [];
    return (
      list.find((e) => e.path === '/home/kali/server/database/fyp2.db' || e.path === '/mnt/external_hdd/server/database/fyp2.db') ||
      list.find((e) => (e.path.endsWith('/fyp2.db') || e.path.endsWith('\\fyp2.db')) && e.live) ||
      list.find((e) => e.path.endsWith('/fyp2.db') || e.path.endsWith('\\fyp2.db')) ||
      list.find((e) => e.path.includes('database/fyp2.db')) ||
      list[0]
    );
  }, [data]);

  const activeVisualizerId = visualizerDbId || primaryDb?.id || '';

  const availableDbs = useMemo(() => {
    return (data?.managed ?? []).map((e) => ({
      id: e.id,
      path: e.path,
      name: e.path.split(/[/\\]/).pop() || e.id,
    }));
  }, [data]);

  const diverged = useMemo(() => groups.filter((group) => group.diverged), [groups]);

  /**
   * Orphaned write-ahead logs sitting in the skipped-noise bucket.
   *
   * Their paths are real and their `-wal` files hold committed transactions, but
   * they are classified as browser/app noise so they never reach the Fleet table.
   * Surfacing them here is the difference between "2 logs need attention" and the
   * truth — the third one belongs to a gateway backup and is the largest of the
   * three (4,157,112 B), so leaving it invisible hides the biggest piece of
   * unabsorbed data.
   */
  const noiseOrphans = useMemo(
    () => (data?.noise ?? []).filter((entry) => entry.orphanedWal && entry.path),
    [data],
  );

  const filtered = useMemo(() => {
    const entries = data?.managed ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.path.toLowerCase().includes(needle) ||
        entry.domainHints.some((hint) => hint.toLowerCase().includes(needle)),
    );
  }, [data, query]);

  const notConfigured = data && !data.configured;

  return (
    <>
      <PageHeader
        title="Databases"
        subtitle={
          data
            ? data.reachable
              ? `${formatNumber(data.managedCount)} managed · ${formatNumber(data.total)} found · ${formatNumber(data.divergedCount)} drifted${
                  noiseOrphans.length > 0 ? ` · ${formatNumber(noiseOrphans.length)} skipped orphan(s)` : ''
                }`
              : `Discovery unavailable — ${data.reason ?? 'unknown reason'}`
            : 'Scanning for databases'
        }
        syncedAt={discovery.generatedAt}
      >
        <button
          type="button"
          className="btn sm"
          onClick={() => discovery.refresh()}
          disabled={discovery.loading}
        >
          {discovery.loading ? <span className="spinner" /> : null}
          Rescan
        </button>
      </PageHeader>

      <PageBody>
        <ErrorAlert error={discovery.error} onRetry={discovery.reload} />

        {notConfigured ? (
          <Alert kind="warn">
            <strong>The database host is not configured.</strong>
            <br />
            {data?.reason ?? 'Set KALI_HOST and credentials in .env on the host.'}
          </Alert>
        ) : null}

        {discovery.loading && !data ? (
          <Card>
            <Loading label="Hashing every database on the host…" />
          </Card>
        ) : null}

        {data ? (
          <div className="grid cols-4">
            <Stat
              label="Managed databases"
              value={formatNumber(data.managedCount)}
              foot={`${formatNumber(data.noiseCount)} browser/app noise skipped`}
            />
            <Stat
              label="Drifted files"
              value={formatNumber(data.divergedCount)}
              foot={diverged.length > 0 ? `${diverged.length} name collision(s)` : 'every duplicate matches'}
            />
            <Stat
              label="Live writers"
              value={formatNumber(data.liveCount ?? (data.managed ?? []).filter((entry) => entry.live).length)}
              foot="databases currently held open"
            />
            <Stat
              label="Pending uncheckpointed"
              value={formatNumber(
                data.orphanedWalCount ?? (data.managed ?? []).filter((entry) => entry.orphanedWal).length,
              )}
              foot="committed rows still only in a log"
            />
            <Stat
              label="Total on disk"
              value={formatBytes((data.managed ?? []).reduce((sum, entry) => sum + entry.sizeBytes, 0))}
              foot={(data.roots ?? []).length > 0 ? `roots ${data.roots.join(', ')}` : 'no roots reported'}
            />
          </div>
        ) : null}

        {data?.reachable && noiseOrphans.length > 0 ? (
          <Alert kind="warn">
            <strong>
              {noiseOrphans.length} skipped file(s) also carry an unabsorbed write-ahead log.
            </strong>
            <br />
            These are classified as browser/app noise, so they are not in the Fleet table — but their logs hold
            committed rows that the main <code className="mono">.db</code> file has not absorbed yet. The largest
            is {formatBytes(Math.max(...noiseOrphans.map((entry) => entry.walBytes ?? 0)))}.
            <ul style={{ margin: '8px 0 0 18px' }}>
              {noiseOrphans.map((entry) => (
                <li key={entry.path} className="mono truncate">
                  {entry.path} — wal {formatBytes(entry.walBytes ?? 0)}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {data?.reachable && diverged.length > 0 ? (
          <Alert kind="error">
            <strong>{diverged.length} database name(s) exist as copies that no longer match.</strong>
            <br />
            Two files with the same name and different contents means at least one app is writing a file nobody reads.
            Open the Drift tab and compare before trusting either copy.
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn sm danger" onClick={() => setTab('drift')}>
                Review {diverged.length} drifted file(s)
              </button>
            </div>
          </Alert>
        ) : null}

        <Tabs
          items={[
            { id: 'visualizer', label: '⚡ Schema Visualizer (Supabase ERD)' },
            { id: 'fleet', label: `Fleet (${formatNumber(data?.managedCount ?? 0)})` },
            { id: 'drift', label: `Drift (${formatNumber(diverged.length)})` },
            { id: 'postgres', label: 'Postgres' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />

        {tab === 'visualizer' ? (
          activeVisualizerId ? (
            <div style={{ marginTop: 14 }}>
              <SupabaseSchemaVisualizer
                id={activeVisualizerId}
                availableDbs={availableDbs}
                onSelectDb={(newId) => setVisualizerDbId(newId)}
              />
            </div>
          ) : (
            <Card>
              <Loading label="Locating databases for Schema Visualizer…" />
            </Card>
          )
        ) : null}

        {tab === 'fleet' && data ? (
          <FleetTab
            filtered={filtered}
            query={query}
            onQuery={setQuery}
            onSelect={setSelected}
            onOpenVisualizer={(dbId) => {
              setVisualizerDbId(dbId);
              setTab('visualizer');
            }}
            selected={selected}
            loading={discovery.loading}
            onRefresh={discovery.refresh}
          />
        ) : null}

        {tab === 'drift' && data ? <DriftTab groups={groups} focus={compareFile} /> : null}

        {tab === 'postgres' ? (
          <PostgresTab
            payload={postgres.data}
            error={postgres.error}
            loading={postgres.loading}
            onRetry={postgres.reload}
          />
        ) : null}
      </PageBody>
    </>
  );
}

function FleetTab({
  filtered,
  query,
  onQuery,
  onSelect,
  onOpenVisualizer,
  selected,
  loading,
  onRefresh,
}: {
  filtered: DbEntry[];
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string | null) => void;
  onOpenVisualizer: (id: string) => void;
  selected: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <Card
        title="Databases under management"
        actions={
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Filter by path or project…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        }
        note="Every file is opened read-only through a `file:<path>?mode=ro` URI. Hashing a database that is in WAL mode creates a `-shm` sidecar on the host — that is a reader artifact, not a write to the database."
        flush
      >
        {filtered.length === 0 ? (
          <Empty title={loading ? 'Scanning…' : 'No databases match'}>
            {loading
              ? 'Hashing each database to detect drift.'
              : 'Clear the filter, or confirm the roots the bridge scans.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Database</th>
                  <th>Domain</th>
                  <th>Size</th>
                  <th>Tables</th>
                  <th>Journal</th>
                  <th>State</th>
                  <th>Modified</th>
                  <th>Writer</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const filename = entry.path.split('/').pop() || entry.path;
                  const dirpath = entry.path.substring(0, entry.path.lastIndexOf('/'));

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)' }}>
                          {filename}
                        </div>
                        <div className="mono faint truncate" style={{ maxWidth: 360, fontSize: '11px', marginTop: '2px' }} title={entry.path}>
                          {dirpath}
                        </div>
                        <span className="faint mono" style={{ fontSize: '10.5px' }}>{entry.id.slice(0, 16)}…</span>
                      </td>
                      <td>
                        {entry.domainHints.length === 0 ? (
                          <span className="faint">—</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {entry.domainHints.slice(0, 3).map((hint) => {
                              const tone =
                                hint === 'auth' ? 'violet' :
                                hint === 'ops' ? 'blue' :
                                hint === 'commerce' ? 'green' :
                                hint === 'admin' ? 'amber' : 'grey';
                              return (
                                <span key={hint} className={`badge ${tone}`} style={{ fontSize: '10.5px', textTransform: 'capitalize' }}>
                                  {hint}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontWeight: 550 }}>{formatBytes(entry.sizeBytes)}</td>
                      <td className="mono">
                        {entry.tableCount === null ? '—' : formatNumber(entry.tableCount)}
                      </td>
                      <td className="mono">
                        {entry.journalMode === 'wal' ? (
                          <span className="app-tag" style={{ color: '#0066cc', borderColor: 'rgba(0,102,204,0.3)', background: 'rgba(0,102,204,0.08)', fontWeight: 600 }}>
                            WAL
                          </span>
                        ) : (
                          <span className="faint">{entry.journalMode ?? '—'}</span>
                        )}
                      </td>
                      <td>
                        {entry.live ? (
                          <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <span className="pulse-dot green" style={{ width: '6px', height: '6px' }} />
                            live
                          </span>
                        ) : entry.orphanedWal ? (
                          <Badge tone="amber">pending</Badge>
                        ) : (
                          <span className="badge grey" style={{ background: 'var(--panel-2)', color: 'var(--text-dim)' }}>
                            idle
                          </span>
                        )}
                        {entry.orphanedWal ? (
                          <span className="chip" title="Committed transactions sit in an unheld write-ahead log">
                            wal {formatBytes(entry.walBytes ?? 0)}
                          </span>
                        ) : null}
                        {entry.holderCount && entry.holderCount > 1 ? (
                          <span className="chip">{entry.holderCount} procs</span>
                        ) : null}
                        {entry.writable ? null : <span className="chip">ro</span>}
                      </td>
                      <td className="mono">{timeAgo(entry.modifiedAt)}</td>
                      <td className="mono faint" style={{ maxWidth: 200 }}>
                        <div className="truncate">{entry.liveNote ?? '—'}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn sm"
                            style={{
                              background: 'rgba(62, 207, 142, 0.12)',
                              color: '#3ecf8e',
                              borderColor: 'rgba(62, 207, 142, 0.3)',
                              fontWeight: 600,
                            }}
                            onClick={() => onOpenVisualizer(entry.id)}
                            title="Open Supabase Schema Visualizer for this database"
                          >
                            ⚡ ERD
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            style={{
                              background: entry.id === selected ? 'var(--accent)' : 'var(--panel-2)',
                              color: entry.id === selected ? '#ffffff' : 'var(--text)',
                              borderColor: 'var(--line)',
                              fontWeight: 550,
                            }}
                            onClick={() => onSelect(entry.id === selected ? null : entry.id)}
                          >
                            {entry.id === selected ? '✕ Close' : '🔍 Inspect'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Floating Apple-Grade Inspection Modal */}
      {selected ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => onSelect(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(1400px, 96vw)',
              height: '88vh',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: '16px',
              boxShadow: '0 30px 70px rgba(0, 0, 0, 0.9), 0 0 30px rgba(255, 255, 255, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Inspector id={selected} onClose={() => onSelect(null)} onRefreshFleet={onRefresh} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Inspector({ id, onClose, onRefreshFleet }: { id: string; onClose?: () => void; onRefreshFleet: () => void }) {
  const inspection = usePoll<InspectionPayload>(`/api/db/${encodeURIComponent(id)}`, 0);
  const data = inspection.data;
  const [table, setTable] = useState<string | null>(null);
  const [mode, setMode] = useState<'visualizer' | 'classic'>('visualizer');

  useEffect(() => setTable(null), [id]);

  if (mode === 'visualizer') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: onClose ? 84 : 14,
            zIndex: 55,
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            type="button"
            className="btn sm"
            onClick={() => setMode('classic')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text)',
              fontSize: '11px',
              border: '1px solid var(--line)',
            }}
            title="Switch to detailed system diagnostics & metrics"
          >
            📋 Diagnostics & Stats
          </button>
        </div>
        <SupabaseSchemaVisualizer id={id} isModal onClose={onClose} />
      </div>
    );
  }

  return (
    <Card
      title={data ? `Inspector — ${data.path}` : 'Inspector'}
      actions={
        <div className="row">
          <button
            type="button"
            className="btn sm"
            style={{
              background: 'rgba(62, 207, 142, 0.15)',
              color: '#3ecf8e',
              borderColor: 'rgba(62, 207, 142, 0.3)',
              fontWeight: 600,
            }}
            onClick={() => setMode('visualizer')}
            title="Switch to Supabase Schema Visualizer ERD"
          >
            ⚡ Supabase ERD
          </button>
          <SnapshotButton target={id} disabled={!data || data.error !== null} />
          <button type="button" className="btn sm ghost" onClick={inspection.refresh} disabled={inspection.loading}>
            {inspection.loading ? <span className="spinner" /> : null}
            Refresh
          </button>
          {onClose && (
            <button type="button" className="btn sm danger" onClick={onClose}>
              ✕ Close
            </button>
          )}
        </div>
      }
      note="Row counts are read from the live file. A large WAL means the file on disk is a partial view — a plain file copy would capture a gutted snapshot."
    >
      <ErrorAlert error={inspection.error} onRetry={inspection.reload} />
      {inspection.loading && !data ? <Loading label="Reading schema…" /> : null}

      {data && data.error ? <Alert kind="error">{data.error}</Alert> : null}

      {data && !data.error ? (
        <>
          <dl className="kv">
            <div style={{ display: 'contents' }}>
              <dt>Integrity</dt>
              <dd className="mono">{data.integrity ?? '—'}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Tables / rows</dt>
              <dd className="mono">
                {formatNumber(data.tableCount)} / {formatNumber(data.rowsTotal)}
              </dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Columns</dt>
              <dd className="mono">{formatNumber(data.columnsTotal)}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Foreign key issues</dt>
              <dd className="mono">
                {data.foreignKeyViolations === null ? '—' : formatNumber(data.foreignKeyViolations)}
              </dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>WAL / SHM</dt>
              <dd className="mono">
                {formatBytes(data.walBytes)} / {formatBytes(data.shmBytes)}
                {data.orphanedWal ? <span className="chip">uncheckpointed</span> : null}
              </dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>sha256</dt>
              <dd className="mono truncate">{data.sha256 ?? '—'}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Held by</dt>
              <dd className="mono">
                {data.holders.length === 0
                  ? 'nobody (no live writer)'
                  : data.holders
                      .map((holder) => {
                        // The holder's own view of the path only differs for a
                        // process in another mount namespace (a container). Show
                        // it, because otherwise a correctly-detected container
                        // holder reads as a path mismatch and looks like a bug.
                        const via =
                          holder.resolved && holder.resolved !== data.path
                            ? ` via ${holder.resolved}`
                            : '';
                        return `${holder.name} (pid ${holder.pid})${via}`;
                      })
                      .join(', ')}
                {data.holders.length === 0 && data.liveNote ? (
                  <span className="chip">{data.liveNote}</span>
                ) : null}
              </dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Modified</dt>
              <dd className="mono">{timeAgo(data.modifiedAt)}</dd>
            </div>
          </dl>

          {data.risk.length > 0 ? (
            <Alert kind="warn">
              <ul style={{ margin: '0 0 0 18px' }}>
                {data.risk.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {data.tables.length === 0 ? (
            <Empty title="This file has no tables">
              It is a valid SQLite file but contains no user tables — likely an abandoned stub.
            </Empty>
          ) : (
            <>
              <div className="table-wrap scroll-y" style={{ maxHeight: 280 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Rows</th>
                      <th>Columns</th>
                      <th>Sensitive</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.tables.map((entry) => {
                      const sensitive = (entry.columns ?? []).filter((column) => column.sensitive);
                      return (
                        <tr key={entry.name}>
                          <td className="mono">{entry.name}</td>
                          <td className="mono">
                            {entry.rows === null ? '—' : formatNumber(entry.rows)}
                          </td>
                          <td className="mono">{formatNumber((entry.columns ?? []).length)}</td>
                          <td>
                            {sensitive.length === 0 ? (
                              <span className="faint">—</span>
                            ) : (
                              <Badge tone="amber">{formatNumber(sensitive.length)} masked</Badge>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => setTable(entry.name === table ? null : entry.name)}
                            >
                              {entry.name === table ? 'Close' : 'Preview'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Keyed by table so paging state resets when the reader switches tables. */}
              {table ? <TablePreview key={table} id={id} table={table} /> : null}
            </>
          )}
        </>
      ) : null}
    </Card>
  );
}

function TablePreview({ id, table }: { id: string; table: string }) {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  const params = new URLSearchParams({
    table,
    limit: String(PREVIEW_LIMIT),
    offset: String(offset),
  });
  if (term) params.set('search', term);

  const preview = usePoll<DbQueryResult>(`/api/db/${encodeURIComponent(id)}/query?${params}`, 0);

  const page = Math.floor(offset / PREVIEW_LIMIT) + 1;
  const pages = preview.data ? Math.max(1, Math.ceil(preview.data.total / PREVIEW_LIMIT)) : 1;
  const canPrev = offset > 0;
  const canNext = preview.data?.hasMore ?? false;

  const jump = (next: number) => setOffset(Math.max(0, next));

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setTerm(search.trim());
  };

  if (preview.loading && !preview.data) return <Loading label={`Reading ${table}…`} />;
  if (preview.error && !preview.data) return <ErrorAlert error={preview.error} onRetry={preview.reload} />;

  const data = preview.data;
  if (!data) return null;

  const columns = data.columns.map((column) => column.name);

  return (
    <Card
      title={`${table} — ${formatNumber(data.rows.length)} of ${formatNumber(data.total)} row(s)`}
      note={
        data.maskedColumns.length > 0
          ? `Masked before leaving the host: ${data.maskedColumns.join(', ')}`
          : 'No sensitive columns detected in this table.'
      }
      flush
    >
      <div className="card-body row" style={{ justifyContent: 'space-between' }}>
        <form className="row" onSubmit={submitSearch}>
          <input
            className="input"
            placeholder="Filter rows (server-side LIKE)"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ minWidth: 240 }}
          />
          <button type="submit" className="btn sm">
            Search
          </button>
          {term ? (
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                setSearch('');
                setTerm('');
                setOffset(0);
              }}
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="row">
          <button type="button" className="btn sm" disabled={!canPrev} onClick={() => jump(offset - PREVIEW_LIMIT)}>
            Prev
          </button>
          <span className="mono dim nowrap">
            page {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <button type="button" className="btn sm" disabled={!canNext} onClick={() => jump(offset + PREVIEW_LIMIT)}>
            Next
          </button>
          {preview.loading ? <span className="spinner" /> : null}
        </div>
      </div>

      {data.rows.length === 0 ? (
        <Empty title="No rows">
          {term ? `No row in ${table} matches “${term}”.` : 'The table exists but is empty.'}
        </Empty>
      ) : (
        <div className="scroll-y" style={{ maxHeight: 360 }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={index}>
                  <td className="mono dim">{formatNumber(offset + index + 1)}</td>
                  {columns.map((column) => (
                    <td key={column} className="mono truncate" style={{ maxWidth: 240 }}>
                      {renderCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Takes a verified copy of a database, on demand, from the dashboard.
 *
 * This is deliberately the *only* write the databases surface can perform, and
 * it never touches the source: the bridge opens the original read-only and uses
 * `VACUUM INTO` to write elsewhere, then reopens the result and counts it. The
 * row count it reports back is the point — a plain file copy of a WAL database
 * would report fewer rows than the live database holds, which is how a backup
 * silently loses committed data.
 */
function SnapshotButton({ target, disabled }: { target: string; disabled?: boolean }) {
  const action = useAction();
  const [result, setResult] = useState<DbSnapshot | null>(null);

  const take = () =>
    action.run('snapshot', async () => {
      const response = await fetch('/api/db/snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, keep: 5 }),
      });
      const payload = (await response.json()) as { ok: boolean; data?: DbSnapshot; error?: string };
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? `Snapshot failed with HTTP ${response.status}`);
      }
      setResult(payload.data);
      return `Snapshot verified — ${formatNumber(payload.data.rowsTotal ?? 0)} row(s), ${
        payload.data.integrity ?? 'no integrity report'
      }`;
    });

  return (
    <>
      <button type="button" className="btn sm primary" onClick={take} disabled={disabled || action.busy !== null}>
        {action.busy ? <span className="spinner" /> : null}
        Snapshot
      </button>
      {action.error ? (
        <div style={{ flexBasis: '100%' }}>
          <ErrorAlert error={action.error} />
        </div>
      ) : null}
      {action.notice ? (
        <div style={{ flexBasis: '100%' }}>
          <Alert kind="ok">
            {action.notice}
            {result ? (
              <>
                <br />
                <span className="mono faint truncate">{result.snapshot}</span>
              </>
            ) : null}
          </Alert>
        </div>
      ) : null}
    </>
  );
}

function DriftTab({
  groups,
  focus,
}: {
  groups: DbDiscovery['duplicateGroups'];
  focus?: string | null;
}) {
  const [pair, setPair] = useState<{ left: string; right: string } | null>(null);

  // A `?compare=<filename>` deep link from the worklist opens that group's pair
  // straight away so the operator lands on the evidence, not on a list.
  useEffect(() => {
    if (!focus) return;
    const group = groups.find((entry) => entry.filename === focus);
    if (group && group.paths.length > 1) {
      setPair({ left: group.paths[0]!, right: group.paths[1]! });
    }
  }, [focus, groups]);

  if (groups.length === 0) {
    return (
      <Card>
        <Empty title="No duplicated database names">
          Every database on the host has a unique filename, so nothing can be silently written to a copy.
        </Empty>
      </Card>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <GroupCard
          key={group.filename}
          group={group}
          onCompare={(left, right) => setPair({ left, right })}
        />
      ))}

      {pair ? <Comparison left={pair.left} right={pair.right} onClose={() => setPair(null)} /> : null}
    </>
  );
}

function GroupCard({
  group,
  onCompare,
}: {
  group: DbDiscovery['duplicateGroups'][number];
  onCompare: (left: string, right: string) => void;
}) {
  const [left, setLeft] = useState(group.paths[0] ?? '');
  const [right, setRight] = useState(group.paths[1] ?? group.paths[0] ?? '');

  return (
    <Card
      title={
        <>
          <span className="mono">{group.filename}</span>{' '}
          {group.diverged ? <Badge tone="red">drifted</Badge> : <Badge tone="green">identical</Badge>}
          {group.schemaMismatch ? <Badge tone="amber">schema differs</Badge> : null}
        </>
      }
      note={
        group.diverged
          ? 'These copies disagree. Confirm which one the running service opens before deleting anything.'
          : 'Every copy reports the same table count. Table counts alone are not proof of equality — compare to be sure.'
      }
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Copy</th>
              <th>Size</th>
              <th>Tables</th>
              <th>Writer</th>
            </tr>
          </thead>
          <tbody>
            {group.paths.map((path, index) => (
              <tr key={path}>
                <td className="mono truncate" style={{ maxWidth: 460 }}>
                  {path}
                </td>
                <td className="mono">{formatBytes(group.sizes[index] ?? null)}</td>
                <td className="mono">
                  {group.tableCounts[index] === undefined || group.tableCounts[index] < 0
                    ? '—'
                    : formatNumber(group.tableCounts[index]!)}
                </td>
                <td>
                  {(group.livePaths ?? []).includes(path) ? (
                    <Badge tone="green">
                      <Dot tone="green" />
                      live
                    </Badge>
                  ) : (
                    <span className="faint">idle</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {group.paths.length > 1 ? (
        <div className="row" style={{ gap: 8, padding: '0 16px 16px' }}>
          <select
            className="select"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            aria-label="Left copy"
          >
            {group.paths.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
          <span className="faint">vs</span>
          <select
            className="select"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            aria-label="Right copy"
          >
            {group.paths.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm primary"
            disabled={left === right}
            onClick={() => onCompare(left, right)}
          >
            Compare
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function Comparison({ left, right, onClose }: { left: string; right: string; onClose: () => void }) {
  const path = `/api/db/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`;
  const comparison = usePoll<DbComparison>(path, 0);

  return (
    <Card
      title="Comparison"
      actions={
        <button type="button" className="btn sm ghost" onClick={onClose}>
          Close
        </button>
      }
      note="Column and row content are hashed only when both sides expose an identical column set and row count."
    >
      <ErrorAlert error={comparison.error} onRetry={comparison.reload} />
      {comparison.loading && !comparison.data ? <Loading label="Diffing both files…" /> : null}

      {comparison.data ? (
        <>
          <div className="grid cols-3">
            <Stat
              label="Verdict"
              value={comparison.data.verdict === 'identical' ? 'IDENTICAL' : 'DIVERGED'}
              foot={`${formatNumber(comparison.data.counts.compared)} table(s) content-hashed`}
            />
            <Stat
              label="Tables differing"
              value={formatNumber(comparison.data.counts.differing)}
              foot={`${formatNumber(comparison.data.counts.identical)} identical`}
            />
            <Stat
              label="Tables only on one side"
              value={formatNumber(comparison.data.counts.onlyLeft + comparison.data.counts.onlyRight)}
              foot={`${formatNumber(comparison.data.counts.onlyLeft)} left / ${formatNumber(comparison.data.counts.onlyRight)} right`}
            />
          </div>

          <dl className="kv">
            <div style={{ display: 'contents' }}>
              <dt>Left</dt>
              <dd className="mono truncate">
                {comparison.data.left.path} ({formatNumber(comparison.data.left.tableCount)} tables)
              </dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt>Right</dt>
              <dd className="mono truncate">
                {comparison.data.right.path} ({formatNumber(comparison.data.right.tableCount)} tables)
              </dd>
            </div>
          </dl>

          {comparison.data.onlyLeft.length + comparison.data.onlyRight.length > 0 ? (
            <Alert kind="info">
              <strong>Tables present on one side only</strong>
              <br />
              <span className="mono">
                {comparison.data.onlyLeft.join(', ') || '—'} | {comparison.data.onlyRight.join(', ') || '—'}
              </span>
            </Alert>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Rows</th>
                  <th>Columns</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {comparison.data.tables
                  .filter((entry) => !entry.identical)
                  .map((entry) => (
                    <tr key={entry.name}>
                      <td className="mono">{entry.name}</td>
                      <td className="mono">
                        {entry.leftRows === null ? '—' : formatNumber(entry.leftRows)} /{' '}
                        {entry.rightRows === null ? '—' : formatNumber(entry.rightRows)}
                      </td>
                      <td className="mono">
                        {formatNumber(entry.leftColumns)} / {formatNumber(entry.rightColumns)}
                      </td>
                      <td>
                        {entry.reason ? (
                          <span className="faint">{entry.reason}</span>
                        ) : entry.missingColumns.length > 0 || entry.extraColumns.length > 0 ? (
                          <span className="mono">
                            {entry.missingColumns.length > 0 ? `missing ${entry.missingColumns.join(', ')}` : ''}
                            {entry.missingColumns.length > 0 && entry.extraColumns.length > 0 ? ' · ' : ''}
                            {entry.extraColumns.length > 0 ? `extra ${entry.extraColumns.join(', ')}` : ''}
                          </span>
                        ) : (
                          <span className="faint">
                            row content differs ({entry.leftHash} vs {entry.rightHash})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function PostgresTab({
  payload,
  error,
  loading,
  onRetry,
}: {
  payload: PostgresPayload | null;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading && !payload) return <Card><Loading label="Looking for a Postgres cluster…" /></Card>;
  if (error) return <ErrorAlert error={error} onRetry={onRetry} />;
  if (!payload) return null;

  if (!payload.available) {
    return (
      <Card>
        <Empty title="No Postgres cluster is reachable">
          {payload.reason ?? 'The bridge could not list Postgres databases on this host.'}
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      title="Postgres"
      note={payload.host ? `${payload.host}:${payload.port ?? 5432}` : undefined}
      flush
    >
      {payload.databases.length === 0 ? (
        <Empty title="No databases">The cluster is running but has no databases to list.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Database</th>
                <th>Size</th>
                <th>Owner</th>
                <th>Encoding</th>
                <th>Tables</th>
              </tr>
            </thead>
            <tbody>
              {payload.databases.map((database) => (
                <tr key={database.name}>
                  <td className="mono">{database.name}</td>
                  <td className="mono">{formatBytes(database.sizeBytes)}</td>
                  <td className="mono">{database.owner ?? '—'}</td>
                  <td className="mono">{database.encoding ?? '—'}</td>
                  <td className="mono">
                    {database.tables === null || database.tables === undefined
                      ? '—'
                      : formatNumber(database.tables)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
