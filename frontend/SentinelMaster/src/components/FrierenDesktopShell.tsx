'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HermesDesktopChat from './HermesDesktopChat';
import type { OverviewPayload } from '@/lib/overview';
import type { RouterCredentials } from '@/lib/router-types';

interface SliceItem {
  id: string;
  name: string;
  sub: string;
  href: string;
  asset: string;
}

const PIE_SLICES: SliceItem[] = [
  { id: 'chat', name: 'ANTIGRAVITY', sub: 'AI Command Console', href: '/chat', asset: '/assets/frieren/radial/mono/antigravity.svg' },
  { id: 'router', name: 'OMNIROUTE', sub: 'AI Gateway (Port 20128)', href: '/router', asset: '/assets/frieren/radial/mono/gemini.svg' },
  { id: 'frieren', name: 'FRIEREN AIOS', sub: 'Neural Copilot & Spells', href: '/frieren', asset: '/assets/frieren/radial/mono/ai-core.svg' },
  { id: 'sentinelai', name: 'SENTINEL AI', sub: 'Cyber Threat Engine (5000)', href: '/sentinelai', asset: '/assets/frieren/radial/mono/sentinel.svg' },
  { id: 'tree', name: 'SENTINEL TREE', sub: 'Family Lineage Studio (8007)', href: '/tree', asset: '/assets/frieren/radial/mono/browser.svg' },
  { id: 'along', name: 'SENTINEL ALONG', sub: 'CAD Sketcher (8028)', href: '/along', asset: '/assets/frieren/radial/mono/vscode.svg' },
  { id: 'ctf', name: 'SENTINEL CTF', sub: 'Challenge Arena (8023)', href: '/ctf', asset: '/assets/frieren/radial/mono/terminal.svg' },
  { id: 'fleet', name: 'SERVER FLEET', sub: 'PM2 Fleet & Kali Linux', href: '/kali', asset: '/assets/frieren/radial/mono/vmhub.svg' },
];

const RUNNING_SERVICES = [
  { id: 'master', name: 'Sentinel Master Hub', port: '3000', href: '/', asset: '/assets/frieren/radial/mono/sentinel.svg' },
  { id: 'router', name: 'OmniRoute AI Gateway', port: '20128', href: '/router', asset: '/assets/frieren/radial/mono/gemini.svg' },
  { id: 'sentinelai', name: 'SentinelAI Backend', port: '5000', href: '/sentinelai', asset: '/assets/frieren/radial/mono/sentinel.svg' },
  { id: 'api', name: 'SentinelAPI Daemon', port: '3010', href: '/kali', asset: '/assets/frieren/radial/mono/terminal.svg' },
  { id: 'tree', name: 'SentinelTree Studio', port: '8007', href: '/tree', asset: '/assets/frieren/radial/mono/browser.svg' },
  { id: 'along', name: 'SentinelAlong CAD', port: '8028', href: '/along', asset: '/assets/frieren/radial/mono/vscode.svg' },
  { id: 'ctf', name: 'Sentinel CTF Arena', port: '8023', href: '/ctf', asset: '/assets/frieren/radial/mono/terminal.svg' },
  { id: 'mlbb', name: 'Sentinel MLBB Analytics', port: '3005', href: '/mlbb', asset: '/assets/frieren/radial/mono/steam.svg' },
];

interface FrierenDesktopShellProps {
  overviewData?: OverviewPayload | null;
  credentialsData?: RouterCredentials | null;
  onSwitchToGrid?: () => void;
}

export default function FrierenDesktopShell({
  overviewData,
  credentialsData,
  onSwitchToGrid,
}: FrierenDesktopShellProps) {
  const router = useRouter();
  const [timeStr, setTimeStr] = useState<string>('00:00:00');
  const [dateStr, setDateStr] = useState<string>('SUN • 15 NOV 2026');
  const [hoveredSlice, setHoveredSlice] = useState<SliceItem | null>(null);
  const [cpuUsage, setCpuUsage] = useState<number>(14);
  const [ramUsage, setRamUsage] = useState<number>(42);

  // Live Clock & Metric updates
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setTimeStr(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);

      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      setDateStr(`${days[d.getDay()]} • ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Soft random jitter for live visual gauges
  useEffect(() => {
    const jitter = setInterval(() => {
      setCpuUsage(Math.floor(12 + Math.random() * 8));
      setRamUsage(Math.floor(40 + Math.random() * 4));
    }, 4000);
    return () => clearInterval(jitter);
  }, []);

  // Pie Menu Geometry calculations
  const cx = 235;
  const cy = 235;
  const R = 210; // Outer radius
  const r = 80;  // Inner radius
  const count = PIE_SLICES.length;
  const anglePerSlice = 360 / count;

  return (
    <div className="frieren-desktop-canvas">
      {/* ── TOP-RIGHT HUD: Digital Clock, Date & System Gauges ── */}
      <div className="top-hud">
        <div className="hud-clock-section">
          <div className="hud-time">{timeStr}</div>
          <div className="hud-date">{dateStr}</div>
        </div>

        <div className="hud-divider" />

        <div className="hud-metrics">
          <div className="metric-pill">
            <div className="metric-meta">
              <span>CPU</span>
              <span className="metric-val">{cpuUsage}%</span>
            </div>
            <div className="metric-bar-bg">
              <div className="metric-bar-fill" style={{ width: `${cpuUsage}%` }} />
            </div>
          </div>

          <div className="metric-pill">
            <div className="metric-meta">
              <span>RAM</span>
              <span className="metric-val">{ramUsage}%</span>
            </div>
            <div className="metric-bar-bg">
              <div className="metric-bar-fill" style={{ width: `${ramUsage}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP-LEFT: THE MONOCHROME GLASS PIE APPLICATION WHEEL ── */}
      <div className="pie-menu-stage">
        <div className="pie-ambient-glow" />

        <svg className="pie-wheel-svg" viewBox="0 0 470 470">
          <defs>
            <radialGradient id="core-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2c224a" />
              <stop offset="60%" stopColor="#151028" />
              <stop offset="100%" stopColor="#080612" />
            </radialGradient>

            <filter id="core-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Slices Container */}
          <g id="slices-group">
            {PIE_SLICES.map((item, i) => {
              const midDeg = -90 + i * anglePerSlice;
              const startDeg = midDeg - anglePerSlice / 2 + 1.2;
              const endDeg = midDeg + anglePerSlice / 2 - 1.2;

              const toRad = (d: number) => (d * Math.PI) / 180;
              const rad1 = toRad(startDeg);
              const rad2 = toRad(endDeg);
              const radMid = toRad(midDeg);

              const p1x = cx + r * Math.cos(rad1);
              const p1y = cy + r * Math.sin(rad1);
              const p2x = cx + R * Math.cos(rad1);
              const p2y = cy + R * Math.sin(rad1);
              const p3x = cx + R * Math.cos(rad2);
              const p3y = cy + R * Math.sin(rad2);
              const p4x = cx + r * Math.cos(rad2);
              const p4y = cy + r * Math.sin(rad2);

              const dPath = `M ${p1x.toFixed(2)} ${p1y.toFixed(2)} L ${p2x.toFixed(2)} ${p2y.toFixed(2)} A ${R} ${R} 0 0 1 ${p3x.toFixed(2)} ${p3y.toFixed(2)} L ${p4x.toFixed(2)} ${p4y.toFixed(2)} A ${r} ${r} 0 0 0 ${p1x.toFixed(2)} ${p1y.toFixed(2)} Z`;

              const iconR = 136;
              const iconX = cx + iconR * Math.cos(radMid);
              const iconY = cy + iconR * Math.sin(radMid);
              const imgSize = 32;

              const labelR = 182;
              const labelX = cx + labelR * Math.cos(radMid);
              const labelY = cy + labelR * Math.sin(radMid);

              const popDist = 12;
              const popX = popDist * Math.cos(radMid);
              const popY = popDist * Math.sin(radMid);

              const isHovered = hoveredSlice?.id === item.id;
              const transformStyle = isHovered ? `translate(${popX.toFixed(2)}px, ${popY.toFixed(2)}px)` : 'translate(0px, 0px)';

              return (
                <g
                  key={item.id}
                  className="slice-item"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredSlice(item)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  onClick={() => router.push(item.href)}
                >
                  <path
                    d={dPath}
                    fill={isHovered ? 'rgba(45, 34, 76, 0.94)' : 'rgba(18, 14, 30, 0.74)'}
                    stroke={isHovered ? '#c4b5fd' : 'rgba(167, 139, 250, 0.28)'}
                    strokeWidth={isHovered ? 2.2 : 1.4}
                    className="pie-slice"
                    style={{ transform: transformStyle }}
                  />
                  <image
                    x={iconX - imgSize / 2}
                    y={iconY - imgSize / 2}
                    width={imgSize}
                    height={imgSize}
                    href={item.asset}
                    className="slice-icon-group"
                    style={{
                      transform: transformStyle,
                      filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.8))',
                    }}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    fontFamily="'Plus Jakarta Sans', var(--sans)"
                    fontSize="9.5"
                    fontWeight="700"
                    fill={isHovered ? '#ffffff' : '#c4b5fd'}
                    textAnchor="middle"
                    dominantBaseline="central"
                    letterSpacing="0.8"
                    className="slice-icon-group"
                    style={{ transform: transformStyle }}
                  >
                    {item.name}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Center Hub: Frieren Neural AI Core */}
          <g
            className="center-core"
            onClick={() => router.push('/frieren')}
          >
            <title>Launch Frieren AIOS Copilot</title>
            {/* Spinning Ring */}
            <circle
              cx={cx}
              cy={cy}
              r={74}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={1.8}
              strokeDasharray="7 5"
              opacity={0.55}
              className="spin-ring"
            />
            <circle
              cx={cx}
              cy={cy}
              r={70}
              fill="url(#core-bg)"
              stroke="rgba(167, 139, 250, 0.45)"
              strokeWidth={1.5}
            />

            {/* AI Core Avatar */}
            <image
              href="/assets/frieren/radial/mono/ai-core.svg"
              x={cx - 30}
              y={cy - 40}
              width={60}
              height={60}
              style={{ filter: 'drop-shadow(0 0 12px rgba(167, 139, 250, 0.6))' }}
            />

            {/* Dynamic Core Text */}
            <text
              x={cx}
              y={cy + 36}
              fontFamily="'Plus Jakarta Sans', var(--sans)"
              fontSize="10"
              fontWeight="800"
              fill="#ffffff"
              textAnchor="middle"
              letterSpacing="1.5"
            >
              {hoveredSlice ? hoveredSlice.name : 'FRIEREN AIOS'}
            </text>
            <text
              x={cx}
              y={cy + 49}
              fontFamily="var(--mono)"
              fontSize="8"
              fontWeight="600"
              fill={hoveredSlice ? '#c4b5fd' : '#a1a1aa'}
              textAnchor="middle"
              letterSpacing="1"
            >
              {hoveredSlice ? hoveredSlice.sub : 'SENTINEL FLEET · ACTIVE'}
            </text>
          </g>
        </svg>
      </div>

      {/* ── DESKTOP RIGHT: HERMES AGENT AI CHAT CARD (SHARED CHAT STREAM) ── */}
      <HermesDesktopChat />

      {/* ── BOTTOM-CENTER: RUNNING SOFTWARE TASKBAR (DOCK) ── */}
      <div className="running-software-dock">
        <div className="running-apps-container">
          {RUNNING_SERVICES.map((srv) => (
            <Link
              key={srv.id}
              href={srv.href}
              className="dock-item"
              title={`${srv.name} (Port ${srv.port})`}
            >
              <img src={srv.asset} alt={srv.name} />
              <div className="dock-tooltip">
                {srv.name} (Port {srv.port} · Active)
              </div>
              <div className="dock-indicator" />
            </Link>
          ))}
        </div>

        <div className="dock-divider" />

        {/* AI Assistant Button */}
        <Link
          href="/frieren"
          className="dock-item"
          id="dock-ai-btn"
          title="Frieren AI Technical Assistant"
        >
          <img src="/assets/frieren/radial/mono/ai-core.svg" alt="AI Assistant" />
          <div className="dock-tooltip">Frieren Copilot (OmniRoute AI)</div>
          <div className="dock-indicator" style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
        </Link>
      </div>
    </div>
  );
}
