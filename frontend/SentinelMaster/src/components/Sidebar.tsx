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
  { href: '/', label: 'Dashboard' },
  { href: '/chat', label: 'Antigravity Chat' },
  { href: '/router', label: 'Sentinel Router (AI Gateway)' },
  { href: '/hermes', label: 'Hermes Agent AI' },
  { href: '/orchestrator', label: 'AI Swarm IDE' },
  { href: '/voice-studio', label: 'Voice Studio' },
  { href: '/opencut', label: 'Video Studio' },
];

const SYSTEM_LINKS: NavLink[] = [
  {
    href: '/kali',
    label: 'Server Management',
    count: (totals) => totals.projects,
  },
  {
    href: '/databases',
    label: 'Databases',
    count: (totals) => totals.databases,
    alert: (totals) => (totals.divergedDatabases ?? 0) > 0,
  },
  { href: '/settings', label: 'Settings' },
];

const ADVANCED_TOOLS: NavLink[] = [
  { href: '/cybermaster', label: 'CyberMaster AI' },
  { href: '/god-view', label: 'God View (Repos)' },
  { href: '/touch', label: 'SentinelTouch' },
  { href: '/grok-bot', label: 'Grok Bot Hub' },
  { href: '/github', label: 'GitHub Sync' },
  { href: '/fame', label: 'SentinelFame' },
  { href: '/autobot', label: 'Autobot' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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

        {/* Green Sidebar Toggle Button (matching user sketch) */}
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
              <span className="nav-count" style={{ background: 'var(--panel-3)', color: 'var(--text)', borderColor: 'var(--line)' }}>
                Free AI
              </span>
            )}
          </Link>
        ))}

        <div className="nav-section" style={{ marginTop: '14px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '10.5px' }}>
          System & Workspaces
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

        <div style={{ marginTop: '16px', padding: '0 4px' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="btn sm ghost"
            style={{
              width: '100%',
              justifyContent: 'space-between',
              color: 'var(--text-faint)',
              fontSize: '11.5px',
              padding: '6px 10px',
              borderRadius: '9999px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <span>Advanced Tools ({ADVANCED_TOOLS.length})</span>
            <span style={{ fontSize: '9px' }}>{showAdvanced ? '▲' : '▼'}</span>
          </button>
        </div>

        {showAdvanced && (
          <div style={{ marginTop: '6px', paddingLeft: '8px', borderLeft: '1px solid rgba(255, 255, 255, 0.08)', marginLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {ADVANCED_TOOLS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={isActive(pathname, link.href) ? 'nav-item active' : 'nav-item'}
                aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                style={{ fontSize: '12.5px', padding: '6px 10px' }}
              >
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        )}
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

