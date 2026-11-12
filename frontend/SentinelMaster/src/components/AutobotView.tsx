'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, Stat, Tabs } from './ui';
import { NotConfigured, PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { ApiError, apiPost, describeError } from './api';
import { paymentTone, timeAgo } from './format';
import type { AutobotSnapshot, FamePayment } from '@/lib/fame';

const TABS = [
  { id: 'runtime', label: 'Runtime' },
  { id: 'queue', label: 'Pending queue' },
  { id: 'battles', label: 'Battles' },
];

function isUnconfigured(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503;
}

/** Renders an arbitrary upstream payload without assuming a schema. */
function PayloadCard({ title, value, note }: { title: string; value: unknown; note?: string }) {
  if (value === null || value === undefined) {
    return (
      <Card title={title} note={note}>
        <Empty title="The bot did not return this dataset" />
      </Card>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Card title={title} note={note}>
          <Empty title="Empty list" />
        </Card>
      );
    }
    const rows = value.slice(0, 50);
    const columns = Array.from(
      new Set(
        rows.flatMap((entry) =>
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? Object.keys(entry as Record<string, unknown>)
            : ['value'],
        ),
      ),
    ).slice(0, 7);

    const cell = (entry: unknown, column: string) => {
      if (entry === null || entry === undefined) return '—';
      if (typeof entry !== 'object' || Array.isArray(entry)) return String(entry);
      const raw = (entry as Record<string, unknown>)[column];
      if (raw === null || raw === undefined) return '—';
      if (typeof raw === 'object') return JSON.stringify(raw);
      return String(raw);
    };

    return (
      <Card title={title} note={note ?? `${rows.length} row(s)`} flush>
        <div className="scroll-y">
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
              {rows.map((entry, index) => (
                <tr key={index}>
                  <td className="mono dim">{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column} className="truncate">
                      {cell(entry, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  if (typeof value === 'object') {
    return (
      <Card title={title} note={note}>
        <dl className="kv">
          {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{key}</dt>
              <dd className="mono truncate">
                {entry === null || entry === undefined
                  ? '—'
                  : typeof entry === 'object'
                    ? JSON.stringify(entry)
                    : String(entry)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    );
  }

  return (
    <Card title={title} note={note}>
      <p className="mono">{String(value)}</p>
    </Card>
  );
}

function BattleForm({ busy, onCreate }: { busy: string | null; onCreate: (input: { eventId: string; singerA: number; singerB: number }) => void }) {
  const [eventId, setEventId] = useState('');
  const [singerA, setSingerA] = useState('');
  const [singerB, setSingerB] = useState('');

  const a = Number.parseInt(singerA, 10);
  const b = Number.parseInt(singerB, 10);
  const validId = /^[A-Za-z0-9._:-]{1,60}$/.test(eventId.trim());
  const valid = validId && Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0 && a !== b;

  return (
    <>
      <label className="field" htmlFor="battle-event">
        Event ID
      </label>
      <input
        id="battle-event"
        className="input"
        value={eventId}
        maxLength={60}
        placeholder="2026-02-round-1"
        onChange={(event) => setEventId(event.target.value)}
      />
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <div>
          <label className="field" htmlFor="battle-a">
            Singer A
          </label>
          <input
            id="battle-a"
            className="input"
            inputMode="numeric"
            value={singerA}
            placeholder="12"
            onChange={(event) => setSingerA(event.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
        <div>
          <label className="field" htmlFor="battle-b">
            Singer B
          </label>
          <input
            id="battle-b"
            className="input"
            inputMode="numeric"
            value={singerB}
            placeholder="27"
            onChange={(event) => setSingerB(event.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!valid || busy !== null}
          onClick={() => onCreate({ eventId: eventId.trim(), singerA: a, singerB: b })}
        >
          {busy === 'create-battle' ? <span className="spinner" /> : null}
          Create battle
        </button>
      </div>
      {!valid && (eventId || singerA || singerB) ? (
        <p className="dim" style={{ marginTop: 8 }}>
          A battle needs an event ID matching <code className="mono">[A-Za-z0-9._:-]</code> and two different positive
          singer IDs.
        </p>
      ) : null}
    </>
  );
}

export default function AutobotView() {
  const [tab, setTab] = useState('runtime');

  const pollPath = tab === 'battles' ? '/api/autobot/battles' : '/api/autobot';
  const autobot = usePoll<AutobotSnapshot>(pollPath, 30_000);
  const action = useAction(() => autobot.refresh());

  const snapshot = autobot.data;
  const unconfigured = isUnconfigured(autobot.error);

  const decide = (paymentId: number, verb: 'approve' | 'reject') =>
    action.run(`${verb}-${paymentId}`, async () => {
      await apiPost(`/api/autobot/payments/${paymentId}/${verb}`);
      return `Autobot payment #${paymentId} ${verb === 'approve' ? 'approved' : 'rejected'}`;
    });

  const createBattle = (input: { eventId: string; singerA: number; singerB: number }) =>
    action.run('create-battle', async () => {
      await apiPost('/api/autobot/battles', input);
      return `Battle created for event ${input.eventId}`;
    });

  const battleCount = useMemo(() => {
    const value = snapshot?.battles;
    if (Array.isArray(value)) return value.length;
    return null;
  }, [snapshot]);

  return (
    <>
      <PageHeader
        title="SentinelFame Autobot"
        subtitle="Operational view of the standalone bot service — reachability, queue and battle pairing"
        syncedAt={autobot.generatedAt}
      >
        <button type="button" className="btn sm" onClick={autobot.refresh} disabled={autobot.loading}>
          {autobot.loading ? <span className="spinner" /> : null}
          Refresh
        </button>
      </PageHeader>

      <PageBody>
        {unconfigured ? (
          <NotConfigured
            title="The Autobot service is not configured"
            variable="AUTOBOT_BASE_URL"
            detail={
              <>
                {describeError(autobot.error)}. Point <code className="mono">AUTOBOT_BASE_URL</code> at the bot API root
                (for example <code className="mono">http://192.168.68.132:8025</code>) and set{' '}
                <code className="mono">AUTOBOT_ADMIN_KEY</code> to the same value as{' '}
                <code className="mono">ADMIN_TOKEN</code> in the bot’s <code className="mono">.env</code>, then restart
                the Hub.
              </>
            }
          />
        ) : (
          <ErrorAlert error={autobot.error} onRetry={autobot.refresh} />
        )}
        <ErrorAlert error={action.error} />
        {action.notice ? <div className="alert ok">{action.notice}</div> : null}

        {autobot.loading && !snapshot ? (
          <Card>
            <Loading label="Contacting the Autobot service…" />
          </Card>
        ) : null}

        {snapshot && snapshot.configured && !snapshot.reachable ? (
          <Alert kind="warn">
            The Autobot endpoint is configured but unreachable — {snapshot.error ?? 'no response from the bot API'}. The
            service may be stopped; check the Kali dashboard’s PM2 table.
          </Alert>
        ) : null}

        {snapshot && snapshot.configured && snapshot.reachable && snapshot.error ? (
          <Alert kind="warn">Partially degraded: {snapshot.error}.</Alert>
        ) : null}

        {snapshot && snapshot.configured ? (
          <>
            <div className="grid cols-4">
              <Stat
                label="Service state"
                value={snapshot.reachable ? 'Reachable' : 'Unreachable'}
                foot={snapshot.reachable ? 'responding to admin calls' : 'no successful call'}
              />
              <Stat
                label="Pending payments"
                value={snapshot.pending.length}
                foot={snapshot.pending.length > 0 ? 'awaiting a decision' : 'queue clear'}
              />
              <Stat
                label="Battle pairings"
                value={battleCount ?? '—'}
                foot={battleCount === null ? 'not returned' : 'loaded from the bot'}
              />
              <Stat
                label="Admin key"
                value={snapshot.reachable ? 'In use' : 'n/a'}
                foot="sent as x-admin-token"
              />
            </div>

            <Tabs items={TABS} active={tab} onChange={setTab} />

            {tab === 'runtime' ? (
              <div className="grid cols-2">
                <PayloadCard title="Bot statistics" value={snapshot.stats} note="GET /api/stats" />
                <Card title="How this dashboard relates to SentinelFame" note="Two independent paths to the same queue">
                  <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                    <li>
                      <strong>SentinelFame</strong> is the authoritative ledger on Cloudflare. Approving there credits
                      votes atomically and is the only path that affects revenue.
                    </li>
                    <li>
                      <strong>This Autobot</strong> runs beside the bot on Kali and keeps its own view of the queue.
                      Use these buttons for reconciliation when the bot has drifted.
                    </li>
                    <li>
                      The bot API historically trusted loopback callers; the Hub always sends{' '}
                      <code className="mono">x-admin-token</code> so behaviour is identical from any host.
                    </li>
                  </ul>
                </Card>
              </div>
            ) : null}

            {tab === 'queue' ? (
              <Card
                title="Autobot pending queue"
                actions={<Badge tone="amber">{snapshot.pending.length}</Badge>}
                note="Actions here call the bot directly — the Cloudflare ledger is not changed"
                flush
              >
                {snapshot.pending.length === 0 ? (
                  <Empty title="The bot reports no pending payments">
                    Either the queue is clear, or the bot cannot read its own database.
                  </Empty>
                ) : (
                  <div className="scroll-y">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Voter</th>
                          <th>Singer</th>
                          <th className="numeric">Votes</th>
                          <th className="numeric">Amount</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th>Received</th>
                          <th className="numeric">Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.pending.map((payment: FamePayment) => (
                          <tr key={payment.id}>
                            <td className="mono nowrap">#{payment.id}</td>
                            <td className="truncate">{payment.voterName || 'anonymous'}</td>
                            <td className="nowrap">
                              {payment.singerName ?? (payment.singerId ? `#${payment.singerId}` : '—')}
                            </td>
                            <td className="numeric">{payment.voteCount}</td>
                            <td className="numeric nowrap">{payment.amount}</td>
                            <td className="nowrap dim">{payment.method || '—'}</td>
                            <td className="nowrap">
                              <Badge tone={paymentTone(payment.status)}>{payment.status}</Badge>
                            </td>
                            <td className="nowrap dim">{timeAgo(payment.createdAt)}</td>
                            <td className="numeric nowrap">
                              <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn sm primary"
                                  disabled={action.busy !== null}
                                  onClick={() => void decide(payment.id, 'approve')}
                                >
                                  {action.busy === `approve-${payment.id}` ? <span className="spinner" /> : null}
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn sm danger"
                                  disabled={action.busy !== null}
                                  onClick={() => void decide(payment.id, 'reject')}
                                >
                                  {action.busy === `reject-${payment.id}` ? <span className="spinner" /> : null}
                                  Reject
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}

            {tab === 'battles' ? (
              <div className="grid cols-2">
                <PayloadCard
                  title="Battle pairings"
                  value={snapshot.battles}
                  note="GET /api/battles"
                />
                <Card
                  title="Create a battle"
                  note="POST /api/battles/create with { event_id, singer_a, singer_b }"
                >
                  <BattleForm busy={action.busy} onCreate={(input) => void createBattle(input)} />
                </Card>
              </div>
            ) : null}
          </>
        ) : null}
      </PageBody>
    </>
  );
}
