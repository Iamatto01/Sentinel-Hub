'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiPost } from './api';
import { formatNumber } from './format';
import SentinelLogo from './SentinelLogo';
import { useSidebar, ThemeToggle } from './HubShell';

interface OverviewTotals {
  projects: number;
  gitRepos: number;
  dirtyRepos: number;
  notPushed: number;
  githubRepos: number;
  pendingPayments: number;
  completedPayments: number;
  revenue: number;
  kaliOnline: number;
  kaliWebsites: number;
  kaliBots: number;
  databases: number;
  divergedDatabases: number;
}

interface OverviewProbe {
  totals: OverviewTotals;
}

interface NavLink {
  href: string;
  label: string;
  count?: (totals: OverviewTotals) => number;
  alert?: (totals: OverviewTotals) => boolean;
}

const CORE_APPS: NavLink[] = [
  { href: '/router', label: 'Sentinel Router' },
  { href: '/hermes', label: 'Hermes Agent AI' },
];

const CODE_APPS: NavLink[] = [
  {
    href: '/github',
    label: 'GitHub Integration',
    count: (totals) => totals.githubRepos,
  },
];

const SYSTEM_LINKS: NavLink[] = [
  {
    href: '/kali',
    label: 'Kali Linux Host',
    count: (totals) => totals.projects,
  },
  {
    href: '/databases',
    label: 'Databases',
    count: (totals) => totals.databases,
    alert: (totals) => (totals.divergedDatabases ?? 0) > 0,
  },
  { href: '/god-view', label: 'God View (All Repos)' },
  { href: '/settings', label: 'Settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname === '/router';
  if (href === '/kali') {
    return pathname === '/kali' || pathname.startsWith('/kali/') || pathname === '/projects' || pathname.startsWith('/projects/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [totals, setTotals] = useState<OverviewTotals | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/overview', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        const body = (await response.json()) as { data?: OverviewProbe };
        if (!cancelled && body?.data?.totals) setTotals(body.data.totals);
      } catch {
        // Decoration only
      }
    };

    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiPost('/api/auth/logout');
    } catch {
      // Ignored
    }
    router.replace('/login');
    router.refresh();
  }, [router, signingOut]);

  return (
    <aside className="sidebar">
      <div className="brand" style={{ padding: '16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SentinelLogo size={32} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <strong style={{ fontSize: '15px', color: 'var(--text)', letterSpacing: '-0.02em', fontWeight: 650 }}>
              Sentinel <span className="serif-accent" style={{ color: 'var(--text)', fontWeight: 400 }}>Hub</span>
            </strong>
            <span
              style={{
                fontSize: '9.5px',
                fontFamily: 'var(--mono)',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'var(--panel-3)',
                color: 'var(--text-dim)',
                border: '1px solid var(--line)',
                fontWeight: 600,
              }}
            >
              v2.0
            </span>
          </div>
        </div>

        {/* Green Sidebar Toggle Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="btn-sidebar-toggle-green"
          title="Collapse sidebar (Ctrl+B)"
          aria-label="Collapse sidebar"
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>
      </div>

      <nav className="nav" aria-label="Primary" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="nav-section" style={{ color: 'var(--text-faint)', fontWeight: 600, fontSize: '10.5px' }}>
          Core Intelligence
        </div>
        {CORE_APPS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(pathname, link.href) ? 'nav-item active' : 'nav-item'}
            aria-current={isActive(pathname, link.href) ? 'page' : undefined}
          >
            <span style={{ flex: 1 }}>{link.label}</span>
            {link.href === '/router' && (
              <span className="nav-count" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                Gateway
              </span>
            )}
            {link.href === '/hermes' && (
              <span className="nav-count" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                Agent
              </span>
            )}
          </Link>
        ))}

        <div className="nav-section" style={{ marginTop: '14px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '10.5px' }}>
          Code & Projects
        </div>
        {CODE_APPS.map((link) => {
          const count = totals && link.count ? link.count(totals) : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? 'nav-item active' : 'nav-item'}
              aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
                {link.label}
              </span>
              {count !== null && count > 0 ? (
                <span className="nav-count" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                  {formatNumber(count)}
                </span>
              ) : null}
            </Link>
          );
        })}

        <div className="nav-section" style={{ marginTop: '14px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '10.5px' }}>
          Server Management
        </div>
        {SYSTEM_LINKS.map((link) => {
          const count = totals && link.count ? link.count(totals) : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? 'nav-item active' : 'nav-item'}
              aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            >
              <span style={{ flex: 1 }}>{link.label}</span>
              {count !== null && count > 0 ? (
                <span className="nav-count">{formatNumber(count)}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <ThemeToggle compact />
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => void signOut()}
            disabled={signingOut}
            style={{ borderRadius: '9999px', border: '1px solid var(--line)', padding: '4px 12px', fontSize: '11.5px', color: 'var(--text-dim)' }}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </aside>
  );
}
