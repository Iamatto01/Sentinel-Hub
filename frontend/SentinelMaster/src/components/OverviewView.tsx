'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageBody } from './PageHeader';
import { usePoll } from './useApi';
import { useSidebar, ThemeToggle, MobileMenuButton } from './HubShell';
import type { OverviewPayload } from '@/lib/overview';
import type { RouterCredentials } from '@/lib/router-types';

export default function OverviewView() {
  const overview = usePoll<OverviewPayload>('/api/overview', 30_000);
  const credentials = usePoll<RouterCredentials>('/api/router/credentials', 120_000);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { isSidebarHidden, toggleSidebar } = useSidebar();

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
                Your unified AI powerhouse. Coding with unlimited free models via Sentinel Router, generating daily video assets, and orchestrating 24/7 server workloads.
              </div>
            </div>
          </div>
        </div>

        {/* 5 Core App Cards (CyberMaster Removed) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 650, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                Core Applications & Workspaces
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
                5 Active
              </span>
            </div>
          </div>

          <div className="app-grid">
            {/* Sentinel Router AI Gateway */}
            <div className="app-card featured">
              <div className="app-card-head">
                <div className="app-icon">
                  ⚡
                </div>
                <div className="app-title-group">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="app-title">Sentinel AI Gateway</div>
                    <span className="app-badge">Unlimited Free AI</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Proxy & Token Saver for Coding Tools</div>
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
                  href={credentials.data?.baseUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary-action"
                >
                  Open Sentinel Router UI ↗
                </a>
                <Link href="/router" className="btn-secondary-action">
                  Setup Guide
                </Link>
              </div>
            </div>

            {/* Voice Studio */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🎙️</div>
                <div className="app-title-group">
                  <div className="app-title">Voice Studio</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Neural Speech Synthesis</div>
                </div>
              </div>
              <div className="app-desc">
                Ultra-realistic speech narration using Microsoft Edge-TTS with 20+ multilingual neural voices for videos, tutorials, and bots.
              </div>
              <div className="app-meta">
                <span className="app-tag">20+ Neural Voices</span>
                <span className="app-tag">SubRip / VTT</span>
              </div>
              <div className="app-actions">
                <Link href="/voice-studio" className="btn-secondary-action">
                  Open Voice Studio →
                </Link>
              </div>
            </div>

            {/* Video Studio */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">🎬</div>
                <div className="app-title-group">
                  <div className="app-title">Video Studio (OpenCut)</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Programmatic Video Rendering</div>
                </div>
              </div>
              <div className="app-desc">
                Automated canvas generator using Pillow and FFmpeg. Renders 16:9 widescreen tutorials and 9:16 vertical shorts with synced subtitles.
              </div>
              <div className="app-meta">
                <span className="app-tag">Pillow + FFmpeg</span>
                <span className="app-tag">1080p & 9:16</span>
              </div>
              <div className="app-actions">
                <Link href="/opencut" className="btn-secondary-action">
                  Open Video Studio →
                </Link>
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
                24/7 node at <code style={{ color: 'var(--text)' }}>192.168.68.132</code> with 156GB NVMe SSD storage. Runs PM2 microservices, Sentinel Router Docker container, and Cloudflare tunnels.
              </div>
              <div className="app-meta">
                <span className="app-tag">156 GB Free</span>
                <span className="app-tag">{totals ? `${totals.kaliOnline} PM2 Online` : '9 PM2 Online'}</span>
                <span className="app-tag">Docker Active</span>
              </div>
              <div className="app-actions">
                <Link href="/kali" className="btn-secondary-action">
                  Manage Server & Fleet →
                </Link>
              </div>
            </div>

            {/* All Projects */}
            <div className="app-card">
              <div className="app-card-head">
                <div className="app-icon">📁</div>
                <div className="app-title-group">
                  <div className="app-title">Sentinel Projects</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Workspace Directory</div>
                </div>
              </div>
              <div className="app-desc">
                Centralized access to all 30+ Sentinel repositories, Telegram bots, frontend dashboards, and Python microservices.
              </div>
              <div className="app-meta">
                <span className="app-tag">{totals ? `${totals.projects} Workspaces` : '30+ Workspaces'}</span>
                <span className="app-tag">Git Management</span>
              </div>
              <div className="app-actions">
                <Link href="/kali?tab=projects" className="btn-secondary-action">
                  Browse All Projects →
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
    </>
  );
}
