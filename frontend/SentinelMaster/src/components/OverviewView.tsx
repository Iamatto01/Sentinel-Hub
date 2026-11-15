'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageBody } from './PageHeader';
import { usePoll } from './useApi';
import { useSidebar, ThemeToggle, MobileMenuButton } from './HubShell';
import FrierenDesktopShell from './FrierenDesktopShell';
import type { OverviewPayload } from '@/lib/overview';
import type { RouterCredentials } from '@/lib/router-types';

export default function OverviewView() {
  const overview = usePoll<OverviewPayload>('/api/overview', 30_000);
  const credentials = usePoll<RouterCredentials>('/api/router/credentials', 120_000);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [viewMode, setViewModeState] = useState<'desktop' | 'grid'>('desktop');
  const { isSidebarHidden, toggleSidebar } = useSidebar();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sentinel_hub_view_mode');
      if (saved === 'grid' || saved === 'desktop') {
        setViewModeState(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const setViewMode = (mode: 'desktop' | 'grid') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('sentinel_hub_view_mode', mode);
    } catch {
      // Ignore
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const totals = overview.data?.totals;
  const creds = credentials.data;
  // Resolved server-side from HUB_ROUTER_PUBLIC_URL / HUB_ROUTER_URL so the
  // displayed endpoint follows the deployment instead of a stale literal. The
  // `/v1` strip is idempotent because the env value may already carry it.
  const baseUrl = creds ? `${creds.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')}/v1` : null;

  return (
    <>
      {/* Minimal Apple-Grade Frosted Glass Topbar */}
      <div className="topbar">
        {/* Mobile hamburger — always visible on small screens */}
        <MobileMenuButton />
        {/* Desktop: expand button shown only when sidebar is hidden */}
        {isSidebarHidden && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="btn-sidebar-toggle-green"
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
            style={{ marginRight: '6px' }}
          >
            <span className="bar" />
            <span className="bar" />
            <span className="bar" />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-faint)', fontWeight: 500 }}>Sentinel Hub</span>
          <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>/</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>Overview</span>
        </div>
        <div className="topbar-spacer" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Frieren Desktop OS vs Bento Grid Switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(167, 139, 250, 0.22)',
              borderRadius: '12px',
              padding: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              style={{
                padding: '4px 10px',
                borderRadius: '10px',
                border: 'none',
                background: viewMode === 'desktop' ? 'rgba(167, 139, 250, 0.25)' : 'transparent',
                color: viewMode === 'desktop' ? '#ffffff' : 'var(--text-faint)',
                fontSize: '11.5px',
                fontWeight: viewMode === 'desktop' ? 650 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
              title="Frieren AIOS Desktop Canvas Mode"
            >
              <span>🖥️</span>
              <span>Frieren Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                padding: '4px 10px',
                borderRadius: '10px',
                border: 'none',
                background: viewMode === 'grid' ? 'rgba(167, 139, 250, 0.25)' : 'transparent',
                color: viewMode === 'grid' ? '#ffffff' : 'var(--text-faint)',
                fontSize: '11.5px',
                fontWeight: viewMode === 'grid' ? 650 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
              title="Classic Bento Grid Mode"
            >
              <span>📊</span>
              <span>Bento Grid</span>
            </button>
          </div>

          <span className="topbar-ip-badge" style={{ fontSize: '11.5px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
            192.168.68.132
          </span>
          <span
            className="topbar-kali-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '9999px',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              fontSize: '11px',
              color: 'var(--text)',
            }}
          >
            <span className={`pulse-dot ${overview.data?.kali?.state === 'ok' ? 'green' : 'amber'}`} style={{ width: '6px', height: '6px' }} />
            <span>Node {overview.data?.kali?.state === 'ok' ? 'Online' : 'Checking'}</span>
          </span>
          <ThemeToggle />
        </div>
      </div>

      {viewMode === 'desktop' ? (
        <FrierenDesktopShell
          overviewData={overview.data}
          credentialsData={credentials.data}
          onSwitchToGrid={() => setViewMode('grid')}
        />
      ) : (
        <PageBody>
        {/* Apple-Style Monochrome Glass Hero Banner */}
        <div className="hero-card">
          <div className="hero-header">
            <div>
              <div className="hero-title">
                <span>
                  Welcome to <span className="serif-accent" style={{ color: 'var(--text)', fontStyle: 'italic', fontWeight: 400 }}>Sentinel Hub</span>
                </span>
              </div>
              <div className="hero-sub" style={{ marginTop: '8px' }}>
                Your unified central powerhouse. Orchestrating coding models via Sentinel Router, interactive web platforms (Tree, Along, CTF, MLBB), and 24/7 server workloads under one roof.
              </div>
            </div>
          </div>
        </div>

        {/* Unified Sentinel Systems & Workspaces */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 650, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                Unified Systems & Web Platforms
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--mono)',
                  padding: '1px 8px',
                  borderRadius: '9999px',
                  background: 'var(--panel-2)',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--line)',
                }}
              >
                All Under Hub
              </span>
            </div>
          </div>

          <div className="app-grid">
            {/* Sentinel Router AI Gateway */}
            <div className="app-card featured">
              <div className="app-card-head">
                <div className="app-icon">⚡</div>
                <div className="app-title-group">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="app-title">Sentinel AI Gateway</div>
                    <span className="app-badge">Unlimited Free AI</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>OmniRoute Proxy & Token Saver</div>
                </div>
              </div>

              <div className="app-desc">
                Route Cursor, Claude Code, Cline, and Antigravity to free Claude, Gemini, and GPT across 40+ providers. Auto-fallback and -40% token savings.
              </div>

              <div className="app-meta">
                <span className="app-tag">770+ Models</span>
                <span className="app-tag">RTK Token Saver</span>
                <span className="app-tag">Port 20128</span>
              </div>

              <div className="app-actions">
                <a
                  href={credentials.data?.baseUrl ?? 'https://router.sentinelai.studio'}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary-action"
                >
                  Open Router UI ↗
                </a>
                <Link href="/router" className="btn-secondary-action">
                  Setup Guide →
                </Link>
              </div>
            </div>

            {/* Frieren AIOS Copilot & Workspace */}
            <div className="app-card featured" style={{ borderColor: 'rgba(167, 139, 250, 0.45)' }}>
              <div className="app-card-head">
                <div className="app-icon" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#c4b5fd' }}>🧝‍♀️</div>
                <div className="app-title-group">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="app-title">Frieren AIOS Copilot</div>
                    <span className="app-badge" style={{ background: 'rgba(167, 139, 250, 0.2)', color: '#c4b5fd', borderColor: 'rgba(167, 139, 250, 0.4)' }}>✦ Neural Workspace</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>OmniRoute AI & Fleet Intelligence</div>
                </div>
              </div>

              <div className="app-desc">
                Desktop companion & neural workspace powered by OmniRoute on Port 20128. Fleet supervisor audit, SQLite WAL monitor, and grimoire intelligence.
              </div>

              <div className="app-meta">
                <span className="app-tag" style={{ color: '#c4b5fd' }}>Chibi Pet (Alt+F)</span>
                <span className="app-tag">Gemini 3.8 Flash</span>
                <span className="app-tag">AIOS Shell</span>
              </div>

              <div className="app-actions">
                <Link href="/frieren" className="btn-primary-action" style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
                  Launch AIOS Workspace →
                </Link>
              </div>
            </div>

            {/* Antigravity AI Console */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">💬</div>
                <div className="app-title-group">
                  <div className="app-title">Antigravity Chat</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Embedded AI Command Console</div>
                </div>
              </div>
              <div className="app-desc">
                Minimalist AI Chat console with multi-project organization, prompt chaining, and direct gateway integration.
              </div>
              <div className="app-meta">
                <span className="app-tag">Multi-Model</span>
                <span className="app-tag">In-Hub Embedded</span>
              </div>
              <div className="app-actions">
                <Link href="/chat" className="btn-secondary-action">
                  Open Chat Console →
                </Link>
              </div>
            </div>

            {/* SentinelTree */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🌳</div>
                <div className="app-title-group">
                  <div className="app-title">SentinelTree</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Warisan Jamal Awang Family Tree</div>
                </div>
              </div>
              <div className="app-desc">
                Interactive family heritage tree with 93 members, dynamic branch vs full-tree dual view modes, relationship editor, and photo gallery.
              </div>
              <div className="app-meta">
                <span className="app-tag">93 Ahli</span>
                <span className="app-tag">Dual View Mode</span>
                <span className="app-tag">Port 8007</span>
              </div>
              <div className="app-actions">
                <Link href="/tree" className="btn-primary-action">
                  Open in Hub →
                </Link>
                <a
                  href="https://tree.sentinelai.studio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary-action"
                >
                  Direct Site ↗
                </a>
              </div>
            </div>

            {/* SentinelAlong */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">📐</div>
                <div className="app-title-group">
                  <div className="app-title">SentinelAlong</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>CAD & Floorplan Room Sketcher</div>
                </div>
              </div>
              <div className="app-desc">
                Minimalist CAD architecture and vector floor plan sketcher designed for fast room layout drafting and measurement.
              </div>
              <div className="app-meta">
                <span className="app-tag">Vector Canvas</span>
                <span className="app-tag">Realtime CAD</span>
                <span className="app-tag">Port 8028</span>
              </div>
              <div className="app-actions">
                <Link href="/along" className="btn-primary-action">
                  Open in Hub →
                </Link>
                <a
                  href="https://along.sentinelai.studio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary-action"
                >
                  Direct Site ↗
                </a>
              </div>
            </div>

            {/* Sentinel CTF Platform */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🚩</div>
                <div className="app-title-group">
                  <div className="app-title">Sentinel CTF</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Cybersecurity Challenge Arena</div>
                </div>
              </div>
              <div className="app-desc">
                Automated security challenge platform equipped with 63 specialized tools spanning crypto, pwn, reversing, forensics, and web exploits.
              </div>
              <div className="app-meta">
                <span className="app-tag">63 Tools</span>
                <span className="app-tag">CTF Arena</span>
                <span className="app-tag">Port 8023</span>
              </div>
              <div className="app-actions">
                <Link href="/ctf" className="btn-primary-action">
                  Open in Hub →
                </Link>
                <a
                  href="https://ctf.sentinelai.studio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary-action"
                >
                  Direct Site ↗
                </a>
              </div>
            </div>

            {/* Sentinel MLBB */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🎮</div>
                <div className="app-title-group">
                  <div className="app-title">Sentinel MLBB</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Mobile Legends Tournament Platform</div>
                </div>
              </div>
              <div className="app-desc">
                Next.js gaming analytics platform with live player match scraping, game logs, and automated bot telemetry.
              </div>
              <div className="app-meta">
                <span className="app-tag">Next.js App</span>
                <span className="app-tag">Port 3005</span>
              </div>
              <div className="app-actions">
                <Link href="/mlbb" className="btn-primary-action">
                  Open in Hub →
                </Link>
                <a
                  href="https://mlbb.sentinelai.studio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary-action"
                >
                  Direct Site ↗
                </a>
              </div>
            </div>

            {/* SentinelAI Studio */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🛡️</div>
                <div className="app-title-group">
                  <div className="app-title">SentinelAI Platform</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Core Analysis & Audit Portal</div>
                </div>
              </div>
              <div className="app-desc">
                Central cybersecurity auditing portal with automated exploit verification, security scoring, and telemetry reporting.
              </div>
              <div className="app-meta">
                <span className="app-tag">Vite Preview</span>
                <span className="app-tag">Port 5173</span>
              </div>
              <div className="app-actions">
                <Link href="/sentinelai" className="btn-primary-action">
                  Open in Hub →
                </Link>
                <a
                  href="https://sentinelai.studio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary-action"
                >
                  Direct Site ↗
                </a>
              </div>
            </div>

            {/* Server Management */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🖥️</div>
                <div className="app-title-group">
                  <div className="app-title">Server Management</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Dedicated 24/7 Home Lab & Fleet</div>
                </div>
              </div>
              <div className="app-desc">
                24/7 dedicated node at <code style={{ color: 'var(--text)' }}>192.168.68.132</code>. Runs PM2 microservices, Docker containers, and Cloudflare tunnels.
              </div>
              <div className="app-meta">
                <span className="app-tag">{totals ? `${totals.kaliOnline} PM2 Online` : '9 PM2 Online'}</span>
                <span className="app-tag">Docker Active</span>
                <span className="app-tag">RAM / CPU Telemetry</span>
              </div>
              <div className="app-actions">
                <Link href="/kali" className="btn-secondary-action">
                  Manage Server & Fleet →
                </Link>
              </div>
            </div>

            {/* All Projects & Workspaces */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">📁</div>
                <div className="app-title-group">
                  <div className="app-title">Sentinel Workspaces</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Master Workspace Directory</div>
                </div>
              </div>
              <div className="app-desc">
                Centralized access to all 30+ Sentinel repositories, Telegram bots, frontend dashboards, and Python microservices.
              </div>
              <div className="app-meta">
                <span className="app-tag">{totals ? `${totals.projects} Workspaces` : '30+ Workspaces'}</span>
                <span className="app-tag">Git Tracking</span>
              </div>
              <div className="app-actions">
                <Link href="/god-view" className="btn-secondary-action">
                  Browse All Repos →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Sentinel Router Quick Connect Helper */}
        <div className="setup-box" style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <strong style={{ fontSize: '14.5px', color: 'var(--text)', letterSpacing: '-0.01em' }}>
                Sentinel Router Quick-Connect <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(Use in Cursor, Claude Code, or Antigravity)</span>
              </strong>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {creds?.managementPasswordConfigured ? (
                <>Dashboard password: <code style={{ color: 'var(--text)', background: 'var(--panel-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--line)' }}>from HUB_ROUTER_PASSWORD in .env.local</code></>
              ) : (
                <span style={{ color: '#fbbf24' }}>⚠ HUB_ROUTER_PASSWORD is not configured</span>
              )}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginTop: '6px' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>
                OpenAI Base URL (for Cursor / Antigravity / Cline):
              </span>
              <div className="snippet-row">
                {baseUrl ? (
                  <a
                    href={baseUrl.replace(/\/v1$/, '')}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--text)',
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title={`Open ${baseUrl.replace(/\/v1$/, '')}`}
                  >
                    <span>{baseUrl}</span> ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text)' }}>—</span>
                )}
                <button
                  type="button"
                  className="copy-button"
                  disabled={!baseUrl}
                  onClick={() => baseUrl && copyToClipboard(baseUrl, 'url')}
                >
                  {copiedKey === 'url' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-faint)', display: 'block', marginBottom: '6px' }}>
                Master API Key:
              </span>
              <div className="snippet-row">
                <span style={{ color: 'var(--text)' }}>
                  {creds?.apiKey.preview ?? (creds ? 'not configured' : '…')}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>
                  copy full key from .env.local
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <span>
              Gateway:{' '}
              {creds ? (
                <strong style={{ color: creds.reachable ? '#34d399' : '#f87171' }}>
                  {creds.reachable ? `reachable${creds.health ? ` (${creds.health})` : ''}` : 'unreachable'}
                </strong>
              ) : (
                '…'
              )}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span>
              {creds ? (
                <>
                  <strong style={{ color: 'var(--text)' }}>{creds.models.length}</strong> aliases:{' '}
                  <code style={{ color: 'var(--text)' }}>{creds.models.slice(0, 4).join(', ')}</code>
                  {creds.models.length > 4 ? ` +${creds.models.length - 4} more` : ''}
                </>
              ) : (
                'Aliases: …'
              )}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', background: 'var(--panel)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            {creds?.models.length ? (
              <>
                💡 <strong style={{ color: 'var(--text)' }}>Live aliases:</strong>{' '}
                {creds.models.map((name: string) => (
                  <code key={name} style={{ color: 'var(--text)', background: 'var(--panel-2)', padding: '1px 6px', borderRadius: '4px', marginRight: '6px', border: '1px solid var(--line)' }}>{name}</code>
                ))}
              </>
            ) : (
              <>💡 <strong style={{ color: 'var(--text)' }}>Live aliases:</strong> none — the gateway has no combos configured.</>
            )}
          </div>
        </div>
      </PageBody>
      )}
    </>
  );
}
