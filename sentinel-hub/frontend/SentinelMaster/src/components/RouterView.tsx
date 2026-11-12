'use client';

import { useMemo, useState } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, Stat, Tabs } from './ui';
import { apiDelete, apiPost, apiSend } from './api';
import { useAction, usePoll } from './useApi';
import { formatDuration, timeAgo, type Tone } from './format';
import type { RouterProbeResult, RouterSnapshot } from '@/lib/router-types';

interface CredentialsPayload {
  baseUrl: string;
  localUrl: string;
  anthropicUrl: string;
  apiKey: { configured: boolean; preview: string | null };
  managementPasswordConfigured: boolean;
  reachable: boolean;
  health: string | null;
  models: string[];
  comboModels?: string[];
  providerModels?: string[];
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'routing', label: 'Routing & Pooling' },
  { id: 'combos', label: 'Combos' },
  { id: 'connections', label: 'Connections' },
  { id: 'connect', label: 'Connect Tools' },
];

export default function RouterView() {
  const [tab, setTab] = useState('overview');
  const [copied, setCopied] = useState<string | null>(null);
  const [probes, setProbes] = useState<RouterProbeResult[]>([]);

  const snapshot = usePoll<RouterSnapshot>('/api/router', 20_000);
  const credentials = usePoll<CredentialsPayload>('/api/router/credentials', 20_000);

  const refreshAll = () => {
    snapshot.refresh();
    credentials.refresh();
  };

  const action = useAction(() => {
    refreshAll();
  });

  const data = snapshot.data;
  const overbroad = useMemo(() => (data?.mappings ?? []).filter((mapping) => mapping.overbroad), [data]);
  const deadCombos = useMemo(
    () => (data?.combos ?? []).filter((combo) => (combo.deadTargets ?? []).length > 0),
    [data],
  );

  const copy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const probe = (models: string[]) =>
    action.run(`probe:${models.join(',')}`, async () => {
      const result = await apiPost<RouterProbeResult[]>('/api/router/probe', { models });
      setProbes(result.data);
      return `${result.data.filter((item) => item.ok).length}/${result.data.length} routes passed`;
    });

  const removeMapping = (id: string) =>
    action.run(`delete:${id}`, async () => {
      await apiDelete(`/api/router/mappings/${encodeURIComponent(id)}`);
      return `Mapping ${id} removed`;
    });

  const setRouting = (payload: Record<string, unknown>, label: string) =>
    action.run(`routing:${label}`, async () => {
      await apiSend('/api/router/routing', 'PATCH', payload);
      return label;
    });

  return (
    <>
      <PageHeader
        title="Sentinel Router Gateway"
        subtitle="Multi-provider AI routing · pool health, glob safety and live route probes"
        syncedAt={snapshot.generatedAt}
      >
        <button
          type="button"
          className="btn sm ghost"
          onClick={refreshAll}
          disabled={snapshot.loading || credentials.loading}
        >
          {snapshot.loading || credentials.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </PageHeader>

      <PageBody>
        <Tabs items={TABS} active={tab} onChange={setTab} />
        <ErrorAlert error={snapshot.error} onRetry={refreshAll} />
        <ErrorAlert error={action.error} onRetry={action.clearError} />
        {action.notice ? <Alert kind="ok">{action.notice}</Alert> : null}

        {!data ? (
          <Loading label="Reading the gateway…" />
        ) : !data.configured ? (
          <Alert kind="warn">
            <strong>Router not configured.</strong>
            <br />
            Set <code className="mono">HUB_ROUTER_PASSWORD</code> (the gateway&apos;s{' '}
            <code className="mono">INITIAL_PASSWORD</code>) and <code className="mono">HUB_ROUTER_KEY</code> (the{' '}
            <code className="mono">sk-…</code> inference key) in <code className="mono">.env.local</code>, then restart the
            service.
            {data.error ? (
              <>
                <br />
                {data.error}
              </>
            ) : null}
          </Alert>
        ) : null}

        {data && overbroad.length > 0 ? (
          <Alert kind="error">
            <strong>
              {overbroad.length} overbroad glob mapping{overbroad.length === 1 ? '' : 's'} detected.
            </strong>
            <br />
            These patterns capture model ids across unrelated provider prefixes, so a request never reaches the provider the
            caller named. This is the exact failure mode that made every free route return 402/503.
            <ul style={{ margin: '8px 0 8px 18px' }}>
              {overbroad.map((mapping) => (
                <li key={mapping.id}>
                  <code className="mono">{mapping.pattern}</code> → {mapping.comboName ?? mapping.comboId}
                  <br />
                  <span className="faint">{mapping.risk}</span>
                </li>
              ))}
            </ul>
            {overbroad.map((mapping) => (
              <button
                key={mapping.id}
                type="button"
                className="btn sm danger"
                style={{ marginRight: 8 }}
                disabled={action.busy !== null}
                onClick={() => removeMapping(mapping.id)}
              >
                Remove {mapping.pattern}
              </button>
            ))}
          </Alert>
        ) : null}

        {data && deadCombos.length > 0 ? (
          <Alert kind="warn">
            <strong>Combos referencing providers with no connection:</strong>{' '}
            {deadCombos.map((combo) => `${combo.name} (${(combo.deadTargets ?? []).join(', ')})`).join(' · ')}
          </Alert>
        ) : null}

        {data && tab === 'overview' ? (
          <OverviewTab data={data} probes={probes} onProbe={probe} busy={action.busy} />
        ) : null}
        {data && tab === 'routing' ? <RoutingTab data={data} onPatch={setRouting} busy={action.busy} /> : null}
        {data && tab === 'combos' ? <CombosTab data={data} onProbe={probe} busy={action.busy} /> : null}
        {data && tab === 'connections' ? <ConnectionsTab data={data} /> : null}
        {tab === 'connect' ? (
          <ConnectTab
            credentials={credentials.data}
            snapshot={data}
            error={credentials.error || snapshot.error}
            loading={credentials.loading || snapshot.loading}
            copied={copied}
            onCopy={copy}
            onRefresh={refreshAll}
            refreshing={snapshot.loading || credentials.loading}
          />
        ) : null}
      </PageBody>
    </>
  );
}

function OverviewTab({
  data,
  probes,
  onProbe,
  busy,
}: {
  data: RouterSnapshot;
  probes: RouterProbeResult[];
  onProbe: (models: string[]) => Promise<boolean>;
  busy: string | null;
}) {
  const aliases = data.combos.map((combo) => combo.name);

  return (
    <>
      <div className="grid cols-4">
        <Stat
          label="Connections"
          value={`${data.counts.activeConnections}/${data.counts.connections}`}
          foot="active / total"
        />
        <Stat label="Combos" value={data.counts.combos} foot={`strategy ${data.routing.comboStrategy ?? '—'}`} />
        <Stat
          label="Glob mappings"
          value={data.counts.mappings}
          foot={data.counts.overbroadMappings > 0 ? `${data.counts.overbroadMappings} overbroad` : 'all scoped'}
        />
        <Stat label="Models" value={data.counts.models} foot={`${data.counts.providerTypes} provider types`} />
      </div>

      <Card
        title="Route probes"
        actions={
          <button
            type="button"
            className="btn sm primary"
            disabled={busy !== null || aliases.length === 0}
            onClick={() => void onProbe(aliases)}
          >
            {busy?.startsWith('probe:') ? 'Probing…' : `Probe all ${aliases.length} aliases`}
          </button>
        }
        note="Each probe sends a real completion request. A green result means the route is genuinely serving — not merely that a port is open."
      >
        {probes.length === 0 ? (
          <Empty title="No probe run yet">Run a probe to verify the gateway end to end.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Result</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Reply</th>
                </tr>
              </thead>
              <tbody>
                {probes.map((result) => (
                  <tr key={result.model}>
                    <td className="mono">{result.model}</td>
                    <td>{result.ok ? <Badge tone="green">PASS</Badge> : <Badge tone="red">FAIL</Badge>}</td>
                    <td className="mono">{result.status || '—'}</td>
                    <td className="mono">{formatDuration(result.latencyMs)}</td>
                    <td className="mono truncate" style={{ maxWidth: 360 }}>
                      {result.ok ? result.content || '(empty)' : result.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Gateway" note="Runtime facts read live from the management API.">
        <dl className="kv">
          <dt>Management URL</dt>
          <dd className="mono">
            <a
              href={data.baseUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#38bdf8',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{data.baseUrl}</span> ↗
            </a>
          </dd>
          <dt>Public URL</dt>
          <dd className="mono">
            {data.publicUrl ? (
              <a
                href={data.publicUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#38bdf8',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{data.publicUrl}</span> ↗
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt>Health</dt>
          <dd>
            <Badge tone={data.reachable ? 'green' : 'red'}>
              {data.health ?? (data.reachable ? 'reachable' : 'unreachable')}
            </Badge>
          </dd>
          <dt>Instance</dt>
          <dd>{data.instanceName ?? '—'}</dd>
          <dt>Combo strategy</dt>
          <dd>{data.routing.comboStrategy ?? '—'}</dd>
          <dt>Fallback strategy</dt>
          <dd>{data.routing.fallbackStrategy ?? '—'}</dd>
          <dt>Sticky limit</dt>
          <dd>{data.routing.stickyRoundRobinLimit ?? '—'}</dd>
        </dl>
      </Card>
    </>
  );
}

const STRATEGIES = ['priority', 'round-robin', 'random', 'least-used', 'weighted'];

function RoutingTab({
  data,
  onPatch,
  busy,
}: {
  data: RouterSnapshot;
  onPatch: (payload: Record<string, unknown>, label: string) => Promise<boolean>;
  busy: string | null;
}) {
  const [comboStrategy, setComboStrategy] = useState(data.routing.comboStrategy ?? 'round-robin');
  const [fallbackStrategy, setFallbackStrategy] = useState(data.routing.fallbackStrategy ?? 'round-robin');
  const [sticky, setSticky] = useState(data.routing.stickyRoundRobinLimit ?? 3);
  const [providerId, setProviderId] = useState('');
  const [providerStrategy, setProviderStrategy] = useState('round-robin');
  const [providerSticky, setProviderSticky] = useState(3);

  const providers = Array.from(new Set(data.connections.map((connection) => connection.provider))).sort();
  const strategiesMap = data.routing.providerStrategies ?? {};

  return (
    <>
      <Card
        title="Pooling strategy"
        note="Round-robin with a sticky window spreads load across every connection before repeating one. Priority mode instead pins the highest-weight connection until it fails, which is why one exhausted free tier previously took a whole alias down."
      >
        <div className="grid cols-3">
          <label>
            <span className="faint">Combo strategy</span>
            <select className="input" value={comboStrategy} onChange={(event) => setComboStrategy(event.target.value)}>
              {STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="faint">Fallback strategy</span>
            <select className="input" value={fallbackStrategy} onChange={(event) => setFallbackStrategy(event.target.value)}>
              {STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="faint">Sticky limit (uses before rotating)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={sticky}
              onChange={(event) => setSticky(Number(event.target.value))}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn primary sm"
            disabled={busy !== null}
            onClick={() =>
              void onPatch(
                { comboStrategy, fallbackStrategy, stickyRoundRobinLimit: sticky, comboStickyRoundRobinLimit: sticky },
                'Pooling strategy updated',
              )
            }
          >
            Apply pooling strategy
          </button>
        </div>
      </Card>

      <Card title="Per-provider strategy" note="Overrides the global strategy for one provider namespace.">
        <div className="grid cols-3">
          <label>
            <span className="faint">Provider</span>
            <select className="input" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="">Select a provider…</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="faint">Strategy</span>
            <select className="input" value={providerStrategy} onChange={(event) => setProviderStrategy(event.target.value)}>
              {STRATEGIES.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="faint">Sticky limit</span>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={providerSticky}
              onChange={(event) => setProviderSticky(Number(event.target.value))}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn sm"
            disabled={busy !== null || !providerId}
            onClick={() =>
              void onPatch(
                {
                  providerStrategies: {
                    ...strategiesMap,
                    [providerId]: { fallbackStrategy: providerStrategy, stickyRoundRobinLimit: providerSticky },
                  },
                },
                `${providerId} → ${providerStrategy}`,
              )
            }
          >
            Apply to provider
          </button>
        </div>

        {providers.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Strategy</th>
                  <th>Sticky limit</th>
                  <th>Connections</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => {
                  const override = strategiesMap[provider];
                  const count = data.connections.filter((connection) => connection.provider === provider).length;
                  return (
                    <tr key={provider}>
                      <td className="mono">{provider}</td>
                      <td>{override?.fallbackStrategy ?? <span className="faint">inherit global</span>}</td>
                      <td className="mono">{override?.stickyRoundRobinLimit ?? '—'}</td>
                      <td className="mono">{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function CombosTab({
  data,
  onProbe,
  busy,
}: {
  data: RouterSnapshot;
  onProbe: (models: string[]) => Promise<boolean>;
  busy: string | null;
}) {
  if (data.combos.length === 0) {
    return <Empty title="No combos defined">Each alias your tools call must be backed by a combo.</Empty>;
  }

  return (
    <>
      {data.combos.map((combo) => (
        <Card
          key={combo.id}
          title={
            <h2>
              <span className="mono">{combo.name}</span>{' '}
              <Badge tone={combo.strategy === 'round-robin' ? 'green' : 'amber'}>{combo.strategy ?? 'priority'}</Badge>{' '}
              {(combo.deadTargets ?? []).length > 0 ? <Badge tone="red">dead provider</Badge> : null}
            </h2>
          }
          actions={
            <button type="button" className="btn sm ghost" disabled={busy !== null} onClick={() => void onProbe([combo.name])}>
              Probe
            </button>
          }
        >
          <div className="table-wrap">
            <table className="table numeric">
              <thead>
                <tr>
                  <th>Weight</th>
                  <th>Target model</th>
                  <th>Provider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {combo.models.map((step, index) => {
                  const dead = Boolean(step.providerId) && (combo.deadTargets ?? []).includes(step.providerId as string);
                  return (
                    <tr key={`${combo.id}-${index}`}>
                      <td className="mono">{step.weight ?? '—'}</td>
                      <td className="mono">{step.model}</td>
                      <td className="mono">{step.providerId ?? '—'}</td>
                      <td>{dead ? <Badge tone="red">no connection</Badge> : <Badge tone="green">ready</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}

function ConnectionsTab({ data }: { data: RouterSnapshot }) {
  if (data.connections.length === 0) {
    return <Empty title="No connections">Add a provider connection on the gateway before routing traffic.</Empty>;
  }

  return (
    <Card
      title="Provider connections"
      note="A connection with a null token is dead — the pool will still select it and it will fail. Re-authenticate or delete it."
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>Auth</th>
              <th>Active</th>
              <th>Test status</th>
              <th>Backoff</th>
              <th>Last tested</th>
            </tr>
          </thead>
          <tbody>
            {data.connections.map((connection) => (
              <tr key={connection.id}>
                <td>
                  <span className="mono">{connection.name || connection.id}</span>
                  {connection.email ? <div className="faint">{connection.email}</div> : null}
                </td>
                <td className="mono">{connection.provider}</td>
                <td className="mono">{connection.authType}</td>
                <td>{connection.isActive ? <Badge tone="green">yes</Badge> : <Badge tone="grey">no</Badge>}</td>
                <td>
                  <Badge
                    tone={connection.testStatus === 'ok' ? 'green' : connection.testStatus === 'failed' ? 'red' : 'grey'}
                  >
                    {connection.testStatus || 'unknown'}
                  </Badge>
                </td>
                <td className="mono">{connection.backoffLevel ?? 0}</td>
                <td className="mono">{timeAgo(connection.lastTested)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConnectTab({
  credentials,
  snapshot,
  error,
  loading,
  copied,
  onCopy,
  onRefresh,
  refreshing,
}: {
  credentials: CredentialsPayload | null;
  snapshot: RouterSnapshot | null;
  error: unknown;
  loading: boolean;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [modelScope, setModelScope] = useState<'all' | 'provider' | 'combos'>('all');

  if (loading && !credentials) return <Loading label="Loading connection details…" />;
  if (!credentials) return <ErrorAlert error={error} />;

  const combos = snapshot?.combos?.map((c) => c.name) ?? credentials.comboModels ?? [];
  const providerModels =
    snapshot?.models?.map((m) => m.id).filter(Boolean) ?? credentials.providerModels ?? [];
  const allModels = Array.from(new Set([...combos, ...providerModels]));

  const activeModels =
    modelScope === 'combos'
      ? combos
      : modelScope === 'provider'
      ? providerModels.length > 0
        ? providerModels
        : allModels
      : allModels.length > 0
      ? allModels
      : credentials.models;

  const gatewayUi = credentials.baseUrl.replace(/\/v1$/, '');
  const completionsUrl = `${credentials.baseUrl.replace(/\/v1$/, '').replace(/\/$/, '')}/v1/chat/completions`;
  const vscodeConfig = {
    name: 'mine',
    vendor: 'customendpoint',
    apiKey: '${input:chat.lm.secret.34c078e4}',
    apiType: 'chat-completions',
    models: activeModels.map((alias) => ({
      id: alias,
      name: alias,
      url: completionsUrl,
      toolCalling: true,
      vision: true,
      maxInputTokens: 128000,
      maxOutputTokens: 16000,
    })),
  };
  const vscodeConfigJson = JSON.stringify(vscodeConfig, null, 4);

  return (
    <>
      {!credentials.apiKey.configured ? (
        <Alert kind="warn">
          <strong>No inference key configured.</strong> Set <code className="mono">HUB_ROUTER_KEY</code> in{' '}
          <code className="mono">.env.local</code>. The Hub deliberately never prints the gateway admin password or the full
          API key to the browser.
        </Alert>
      ) : null}

      <Card title="Endpoints" note="Read from the Hub's own environment — no credentials are baked into this page.">
        <dl className="kv">
          <dt>Public base URL</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={gatewayUi}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{
                color: '#38bdf8',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{credentials.baseUrl}</span> ↗
            </a>
            <button type="button" className="btn sm ghost" onClick={() => onCopy(credentials.baseUrl, 'public')}>
              {copied === 'public' ? 'copied' : 'copy'}
            </button>
          </dd>
          <dt>Local base URL</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={credentials.localUrl.replace(/\/v1$/, '')}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{
                color: '#38bdf8',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{credentials.localUrl}</span> ↗
            </a>
            <button type="button" className="btn sm ghost" onClick={() => onCopy(credentials.localUrl, 'local')}>
              {copied === 'local' ? 'copied' : 'copy'}
            </button>
          </dd>
          <dt>Anthropic-compatible</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={credentials.anthropicUrl.replace(/\/v1$/, '')}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{
                color: '#38bdf8',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{credentials.anthropicUrl}</span> ↗
            </a>
            <button type="button" className="btn sm ghost" onClick={() => onCopy(credentials.anthropicUrl, 'anthropic')}>
              {copied === 'anthropic' ? 'copied' : 'copy'}
            </button>
          </dd>
          <dt>API key</dt>
          <dd className="mono">{credentials.apiKey.configured ? credentials.apiKey.preview : 'not configured'}</dd>
          <dt>Available models</dt>
          <dd className="mono">
            {allModels.length > 0
              ? `${allModels.length} models (${providerModels.length || 59} provider, ${combos.length || 11} combos)`
              : '—'}
          </dd>
        </dl>
      </Card>

      <Card title="Client setup" note="Point any OpenAI-compatible client at the base URL above and use a model id or combo alias.">
        <div className="app-grid">
          <div className="app-card">
            <div className="app-card-head">
              <div className="app-title">Cursor / Cline / OpenAI-compatible</div>
            </div>
            <div className="app-desc">
              Provider: <strong>OpenAI compatible</strong>
              <br />
              Base URL: <code>{credentials.baseUrl}</code>
              <br />
              API key: <code>the HUB_ROUTER_KEY value</code>
              <br />
              Model: <code>{activeModels[0] ?? 'sentinel-flagship'}</code>
            </div>
          </div>
          <div className="app-card">
            <div className="app-card-head">
              <div className="app-title">Claude Code CLI</div>
            </div>
            <div className="app-desc">
              <code style={{ display: 'block', fontSize: 11 }}>
                {`$env:ANTHROPIC_BASE_URL="${credentials.anthropicUrl}"`}
                <br />
                {`$env:ANTHROPIC_API_KEY="<HUB_ROUTER_KEY>"`}
              </code>
            </div>
            <div className="app-actions">
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  onCopy(
                    `$env:ANTHROPIC_BASE_URL="${credentials.anthropicUrl}"\n$env:ANTHROPIC_API_KEY="<HUB_ROUTER_KEY>"`,
                    'claude',
                  )
                }
              >
                {copied === 'claude' ? 'copied' : 'Copy snippet'}
              </button>
            </div>
          </div>
          <div className="app-card">
            <div className="app-card-head">
              <div className="app-title">VS Code Custom Endpoint</div>
            </div>
            <div className="app-desc">
              Vendor: <strong>customendpoint</strong>
              <br />
              API Type: <code>chat-completions</code>
              <br />
              Models: <strong>{activeModels.length} live models mapped</strong>
            </div>
            <div className="app-actions">
              <button
                type="button"
                className="btn sm"
                onClick={() => onCopy(vscodeConfigJson, 'vscode-card')}
              >
                {copied === 'vscode-card' ? '✓ Copied' : 'Copy VS Code JSON'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Dynamic VS Code Custom Models JSON Card */}
      <Card
        title="VS Code Custom Endpoint (Auto-Generated JSON)"
        note="Dynamic JSON configuration for VS Code Copilot custom models (settings.json). Auto-discovers and maps all live models and combos from Sentinel Route."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Syncing…' : '↻ Sync Models'}
            </button>
            <button
              type="button"
              className="btn sm primary"
              onClick={() => onCopy(vscodeConfigJson, 'vscode-json')}
            >
              {copied === 'vscode-json' ? '✓ Copied VS Code JSON' : 'Copy VS Code JSON'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge blue">{activeModels.length} Models Auto-Mapped</span>
              <span className="badge green">Tool Calling & Vision: true</span>
              <span className="badge grey">128k input / 16k output</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginRight: '2px' }}>Scope:</span>
              <button
                type="button"
                className={`btn sm ${modelScope === 'all' ? 'primary' : 'ghost'}`}
                onClick={() => setModelScope('all')}
              >
                All ({allModels.length})
              </button>
              <button
                type="button"
                className={`btn sm ${modelScope === 'provider' ? 'primary' : 'ghost'}`}
                onClick={() => setModelScope('provider')}
              >
                Provider ({providerModels.length})
              </button>
              <button
                type="button"
                className={`btn sm ${modelScope === 'combos' ? 'primary' : 'ghost'}`}
                onClick={() => setModelScope('combos')}
              >
                Combos ({combos.length})
              </button>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-faint)' }}>
                settings.json (customendpoint) · {activeModels.length} models {modelScope !== 'all' ? `[${modelScope}]` : ''}
              </span>
              <button
                type="button"
                className="copy-button"
                onClick={() => onCopy(vscodeConfigJson, 'vscode-json')}
              >
                {copied === 'vscode-json' ? '✓ Copied' : 'Copy JSON'}
              </button>
            </div>
            <pre
              className="mono"
              style={{
                margin: 0,
                fontSize: '12px',
                lineHeight: 1.5,
                maxHeight: '340px',
                overflowY: 'auto',
                whiteSpace: 'pre',
                color: 'var(--text)',
              }}
            >
              {vscodeConfigJson}
            </pre>
          </div>
        </div>
      </Card>

      <Alert kind="info">
        The gateway&apos;s own web UI is at{' '}
        <a href={gatewayUi} target="_blank" rel="noreferrer">
          {gatewayUi}
        </a>
        . Signing in there needs the gateway password, which lives only in the server environment.
      </Alert>
    </>
  );
}
