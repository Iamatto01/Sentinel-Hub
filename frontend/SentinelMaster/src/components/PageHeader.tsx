'use client';

import type { ReactNode } from 'react';
import { timeAgo } from './format';
import { useSidebar, ThemeToggle, MobileMenuButton } from './HubShell';

/**
 * Sticky page header. Every authenticated page renders exactly one of these
 * inside the `.main` column so the action row stays reachable while scrolling.
 */
export function PageHeader({
  title,
  subtitle,
  syncedAt,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  syncedAt?: string | null;
  children?: ReactNode;
}) {
  const { isSidebarHidden, toggleSidebar } = useSidebar();

  return (
    <header className="topbar">
      {/* Mobile: always show hamburger to open the drawer */}
      <MobileMenuButton />

      {/* Desktop: show expand button only when sidebar is hidden */}
      {isSidebarHidden && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="btn-sidebar-toggle-green"
          title="Expand sidebar (Ctrl+B)"
          aria-label="Expand sidebar"
          style={{ marginRight: '4px' }}
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>
      )}
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="topbar-sub">{subtitle}</div> : null}
      </div>
      <span className="topbar-spacer" />
      {syncedAt ? <span className="topbar-sub nowrap">{`synced ${timeAgo(syncedAt)}`}</span> : null}
      <ThemeToggle />
      {children}
    </header>
  );
}

/** Wraps page content in the standard padded, max-width container. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="content">{children}</div>;
}

/**
 * Renders the "not configured" explainer used when an integration is missing
 * its credentials. Kept consistent so operators learn the same env var names
 * everywhere in the Hub.
 */
export function NotConfigured({
  title,
  variable,
  detail,
}: {
  title: string;
  variable: string;
  detail?: ReactNode;
}) {
  return (
    <div className="alert warn">
      <span>
        <strong>{title}</strong>
        <br />
        Set <code className="mono">{variable}</code> in <code className="mono">.env</code> on the host and restart the
        service.
        {detail ? (
          <>
            <br />
            {detail}
          </>
        ) : null}
      </span>
    </div>
  );
}
