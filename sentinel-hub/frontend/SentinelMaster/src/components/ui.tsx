'use client';

import type { CSSProperties, ReactNode } from 'react';
import { describeError } from './api';
import type { Tone } from './format';

/** Small presentational primitives shared across every dashboard surface. */

export function Card({
  title,
  actions,
  note,
  flush,
  className,
  style,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  flush?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const classes = ['card', className].filter(Boolean).join(' ');
  return (
    <section className={classes} style={style}>
      {(title || actions) && (
        <header className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions ? (
            <>
              <span className="topbar-spacer" />
              {actions}
            </>
          ) : null}
        </header>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
      {note ? <p className="card-note">{note}</p> : null}
    </section>
  );
}

export function Stat({
  label,
  value,
  foot,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {foot !== undefined ? <span className="stat-foot">{foot}</span> : null}
    </div>
  );
}

export function Badge({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Dot({ tone = 'grey' }: { tone?: Tone }) {
  return <span className={`dot ${tone}`} />;
}

export function Alert({
  kind,
  children,
}: {
  kind: 'error' | 'warn' | 'info' | 'ok';
  children: ReactNode;
}) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

/** Renders a failed request as an alert; renders nothing when there is no error. */
export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="alert error">
      <span style={{ flex: 1 }}>{describeError(error)}</span>
      {onRetry ? (
        <button type="button" className="btn sm ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-line">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Progress({ value, tone }: { value: number | null; tone?: string }) {
  const width = value === null ? 0 : value;
  return (
    <div className={`progress${tone ? ` ${tone}` : ''}`}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          className={item.id === active ? 'tab active' : 'tab'}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
