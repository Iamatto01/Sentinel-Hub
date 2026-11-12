'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Card, Empty, ErrorAlert, Loading, Progress, Stat, Tabs } from './ui';
import { NotConfigured, PageBody, PageHeader } from './PageHeader';
import { useAction, usePoll } from './useApi';
import { apiPost } from './api';
import {
  formatDuration,
  formatMoney,
  formatNumber,
  paymentTone,
  percent,
  progressTone,
  timeAgo,
} from './format';
import type { FamePayment, FameSnapshot, FameStats, FameTraffic } from '@/lib/fame';

/** The `/api/fame` route answers 200 with `configured: false` when unkeyed. */
interface FameUnconfigured {
  configured: false;
  reason: string;
  payments: never[];
  pending: never[];
  recentCompleted: never[];
  syncedAt: string;
}

type FamePayload = FameSnapshot | FameUnconfigured;

const TABS = [
  { id: 'queue', label: 'Pending queue' },
  { id: 'ledger', label: 'Full ledger' },
  { id: 'traffic', label: 'Traffic' },
];

/** Renders whatever shape the Worker's traffic endpoint returns, defensively. */
function TrafficTable({ title, value }: { title: string; value: unknown }) {
  const rows = useMemo(() => {
    if (Array.isArray(value)) {
      return value.slice(0, 25).map((entry, index) => ({ key: String(index), entry }));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .slice(0, 25)
        .map(([key, entry]) => ({ key, entry }));
    }
    return null;
  }, [value]);

  if (value === null || value === undefined) {
    return (
      <Card title={title} note="The Worker did not return this dataset">
        <Empty title="No data" />
      </Card>
    );
  }

  if (rows === null) {
    return (
      <Card title={title}>
        <p className="mono">{String(value)}</p>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title}>
        <Empty title="Empty dataset" />
      </Card>
    );
  }

  const columns = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.entry && typeof row.entry === 'object' && !Array.isArray(row.entry)
          ? Object.keys(row.entry as Record<string, unknown>)
          : ['value'],
      ),
    ),
  ).slice(0, 6);

  const cell = (entry: unknown, column: string) => {
    if (entry === null || entry === undefined) return '—';
    if (typeof entry !== 'object' || Array.isArray(entry)) return String(entry);
    const raw = (entry as Record<string, unknown>)[column];
    if (raw === null || raw === undefined) return '—';
    if (typeof raw === 'object') return JSON.stringify(raw);
    return String(raw);
  };

  return (
    <Card title={title} note={`${formatNumber(rows.length)} row(s)`} flush>
      <div className="scroll-y">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="mono nowrap">{row.key}</td>
                {columns.map((column) => (
                  <td key={column} className="truncate">
                    {cell(row.entry, column)}
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

function PaymentRow({
  payment,
  busy,
  onApprove,
  onReject,
}: {
  payment: FamePayment;
  busy: string | null;
  onApprove: (payment: FamePayment) => void;
  onReject: (payment: FamePayment) => void;
}) {
  const pending = payment.status === 'pending';
  return (
    <tr>
      <td className="mono nowrap">#{payment.id}</td>
      <td>
        <div className="stack" style={{ gap: 2 }}>
          <span className="nowrap">{payment.voterName || 'anonymous'}</span>
          {payment.voterMessage ? (
            <span className="faint truncate" title={payment.voterMessage}>
              {payment.voterMessage}
            </span>
          ) : null}
        </div>
      </td>
      <td className="nowrap">
        {payment.singerName ?? (payment.singerId ? `#${payment.singerId}` : '—')}
      </td>
      <td className="numeric">{formatNumber(payment.voteCount)}</td>
      <td className="numeric nowrap">{formatMoney(payment.amount, payment.currency)}</td>
      <td className="nowrap dim">{payment.method || '—'}</td>
      <td className="nowrap">
        <Badge tone={paymentTone(payment.status)}>{payment.status}</Badge>
      </td>
      <td className="nowrap dim">{timeAgo(payment.createdAt)}</td>
      <td className="numeric nowrap">
        {pending ? (
          <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn sm primary"
              onClick={() => onApprove(payment)}
              disabled={busy !== null}
            >
              {busy === `approve-${payment.id}` ? <span className="spinner" /> : null}
              Approve
            </button>
            <button
              type="button"
              className="btn sm danger"
              onClick={() => onReject(payment)}
              disabled={busy !== null}
            >
              {busy === `reject-${payment.id}` ? <span className="spinner" /> : null}
              Reject
            </button>
          </span>
        ) : (
          <span className="faint">settled</span>
        )}
      </td>
    </tr>
  );
}

function StatsBlock({ stats }: { stats: FameStats }) {
  const pendingShare = percent(
    stats.totalPayments > 0 ? (stats.pendingCount / stats.totalPayments) * 100 : 0,
  );

  return (
    <>
      <div className="grid cols-4">
        <Stat
          label="Realised revenue"
          value={formatMoney(stats.revenue, stats.currency)}
          foot={`${formatNumber(stats.completedCount)} completed · ${formatNumber(stats.completedVotes)} votes credited`}
        />
        <Stat
          label="Pending value"
          value={formatMoney(stats.pendingValue, stats.currency)}
          foot={`${formatNumber(stats.pendingCount)} payment(s) · ${formatNumber(stats.pendingVotes)} votes waiting`}
        />
        <Stat
          label="Total payments"
          value={formatNumber(stats.totalPayments)}
          foot={`${formatNumber(stats.rejectedCount)} rejected`}
        />
        <Stat
          label="Oldest pending"
          value={stats.oldestPendingAt ? formatDuration(Date.now() - Date.parse(stats.oldestPendingAt)) : '—'}
          foot={stats.oldestPendingAt ? timeAgo(stats.oldestPendingAt) : 'queue is empty'}
        />
      </div>

      <Card title="Queue health" note="Share of all payments still awaiting a decision">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="dim">Pending {formatNumber(stats.pendingCount)} of {formatNumber(stats.totalPayments)}</span>
          <span className="mono">{pendingShare === null ? '—' : `${pendingShare.toFixed(1)}%`}</span>
        </div>
        <Progress value={pendingShare} tone={progressTone(pendingShare)} />
        {stats.byMethod.length > 0 ? (
          <>
            <label className="field" style={{ marginTop: 16 }}>
              Volume by payment method
            </label>
            <table className="table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="numeric">Payments</th>
                  <th className="numeric">Value</th>
                </tr>
              </thead>
              <tbody>
                {stats.byMethod.map((entry) => (
                  <tr key={entry.method}>
                    <td className="nowrap">{entry.method || 'unknown'}</td>
                    <td className="numeric">{formatNumber(entry.count)}</td>
                    <td className="numeric">{formatMoney(entry.amountCents / 100, stats.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </Card>
    </>
  );
}

export default function FameView() {
  const [tab, setTab] = useState('queue');
  const [filter, setFilter] = useState('');

  const fame = usePoll<FamePayload>('/api/fame?limit=300', 25_000);
  const traffic = usePoll<FameTraffic>(tab === 'traffic' ? '/api/fame/traffic' : null, 60_000);
  const action = useAction(() => {
    fame.refresh();
  });

  const payload = fame.data;
  const configured = payload !== null && payload !== undefined && !('configured' in payload && payload.configured === false);
  const snapshot = configured ? (payload as FameSnapshot) : null;
  const unconfigured = payload && 'reason' in payload ? payload : null;

  const decided = (paymentId: number, verb: 'approve' | 'reject') =>
    action.run(`${verb}-${paymentId}`, async () => {
      await apiPost(`/api/fame/payments/${paymentId}/${verb}`);
      return `Payment #${paymentId} ${verb === 'approve' ? 'credited' : 'rejected'}`;
    });

  const ledger = useMemo(() => {
    const rows = snapshot?.payments ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (payment) =>
        String(payment.id).includes(needle) ||
        payment.voterName.toLowerCase().includes(needle) ||
        (payment.singerName ?? '').toLowerCase().includes(needle) ||
        (payment.reference ?? '').toLowerCase().includes(needle) ||
        payment.status.toLowerCase().includes(needle) ||
        payment.method.toLowerCase().includes(needle),
    );
  }, [snapshot, filter]);

  return (
    <>
      <PageHeader
        title="SentinelFame"
        subtitle="Payment ledger, approval queue and site traffic from the production Worker"
        syncedAt={fame.generatedAt}
      >
        <button type="button" className="btn sm" onClick={fame.refresh} disabled={fame.loading}>
          {fame.loading ? <span className="spinner" /> : null}
          Refresh ledger
        </button>
      </PageHeader>

      <PageBody>
        <ErrorAlert error={fame.error} onRetry={fame.refresh} />
        <ErrorAlert error={action.error} />
        {action.notice ? <div className="alert ok">{action.notice}</div> : null}

        {unconfigured ? (
          <NotConfigured
            title="SentinelFame is not connected"
            variable="FAME_ADMIN_KEY"
            detail={
              <>
                {unconfigured.reason}. Set <code className="mono">FAME_ADMIN_KEY</code> to the{' '}
                <code className="mono">ADMIN_PASSWORD</code> value configured on the Cloudflare Worker, then restart the
                Hub. The upstream in use is <code className="mono">https://hall-of-fame.sentinelai.studio</code>.
              </>
            }
          />
        ) : null}

        {fame.loading && !payload ? (
          <Card>
            <Loading label="Reading the payment ledger…" />
          </Card>
        ) : null}

        {snapshot ? (
          <>
            {snapshot.stats.pendingCount > 0 ? (
              <Alert kind="warn">
                {formatNumber(snapshot.stats.pendingCount)} payment(s) worth{' '}
                {formatMoney(snapshot.stats.pendingValue, snapshot.stats.currency)} are waiting. Approving credits votes
                immediately through the Worker’s atomic, idempotent claim.
              </Alert>
            ) : null}

            <StatsBlock stats={snapshot.stats} />

            <Tabs items={TABS} active={tab} onChange={setTab} />

            {tab === 'queue' ? (
              <Card
                title="Pending queue"
                actions={<Badge tone="amber">{formatNumber(snapshot.pending.length)}</Badge>}
                note="Oldest first — every approve also refreshes the statistics above"
                flush
              >
                {snapshot.pending.length === 0 ? (
                  <Empty title="Nothing waiting">Every payment has been settled.</Empty>
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
                        {snapshot.pending.map((payment) => (
                          <PaymentRow
                            key={payment.id}
                            payment={payment}
                            busy={action.busy}
                            onApprove={(entry) => void decided(entry.id, 'approve')}
                            onReject={(entry) => void decided(entry.id, 'reject')}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}

            {tab === 'ledger' ? (
              <Card
                title="Full ledger"
                actions={<Badge tone="grey">{formatNumber(ledger.length)}</Badge>}
                note={`Upstream ${snapshot.upstream} · synced ${timeAgo(snapshot.syncedAt)}`}
                flush
              >
                <div className="row" style={{ padding: '0 0 12px' }}>
                  <input
                    className="input search"
                    type="search"
                    placeholder="Filter by id, voter, singer, method, status or reference…"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    aria-label="Filter payments"
                  />
                </div>
                {ledger.length === 0 ? (
                  <Empty title="No payments matched">
                    Clear the filter, or verify that the Worker has received payments.
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
                        {ledger.map((payment) => (
                          <PaymentRow
                            key={payment.id}
                            payment={payment}
                            busy={action.busy}
                            onApprove={(entry) => void decided(entry.id, 'approve')}
                            onReject={(entry) => void decided(entry.id, 'reject')}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}

            {tab === 'traffic' ? (
              <>
                <ErrorAlert error={traffic.error} onRetry={traffic.refresh} />
                {traffic.loading && !traffic.data ? (
                  <Card>
                    <Loading label="Reading traffic analytics…" />
                  </Card>
                ) : null}
                {traffic.data ? (
                  <>
                    <div className="grid cols-3">
                      <Stat label="Unique visitors today" value={formatNumber(traffic.data.todayUnique)} />
                      <Stat label="Datasets returned" value={formatNumber([
                        traffic.data.stats,
                        traffic.data.overTime,
                        traffic.data.countries,
                        traffic.data.referrers,
                        traffic.data.pages,
                      ].filter((value) => value !== null && value !== undefined).length)} foot="of 5" />
                      <Stat label="Synced" value={timeAgo(traffic.generatedAt)} />
                    </div>
                    <div className="grid cols-2">
                      <TrafficTable title="Visit totals" value={traffic.data.stats} />
                      <TrafficTable title="Visitor countries" value={traffic.data.countries} />
                      <TrafficTable title="Referrers" value={traffic.data.referrers} />
                      <TrafficTable title="Top pages" value={traffic.data.pages} />
                    </div>
                    <TrafficTable title="Traffic over time" value={traffic.data.overTime} />
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </PageBody>
    </>
  );
}
