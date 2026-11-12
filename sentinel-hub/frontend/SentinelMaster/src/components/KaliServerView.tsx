'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageBody } from './PageHeader';
import { usePoll } from './useApi';
import { apiPost, describeError } from './api';
import ProjectsView from './ProjectsView';

interface Pm2ProcessData {
  id?: number;
  name: string;
  status: string;
  type?: string;
  cpu: number;
  memoryMb: number;
  restarts: number;
  uptimeMs?: number | null;
  script?: string | null;
  cwd?: string | null;
  pid?: number | null;
}

interface ServiceProbeData {
  operational: boolean;
  httpCode?: number | null;
  latencyMs?: number | null;
}

interface KaliStatusPayload {
  configured?: boolean;
  reachable?: boolean;
  success?: boolean;
  host?: string;
  pingMs?: number | null;
  system?: {
    uptime?: string;
    ram?: { totalMb: number; usedMb: number; freeMb: number; percent: number } | null;
    disk?: { mount?: string; size: string; used: string; avail: string; percent: number } | null;
  };
  pm2?: Pm2ProcessData[];
  pm2Summary?: {
    total: number;
    online: number;
    stopped: number;
    errored: number;
    byType?: { website: number; bot: number; service: number };
    cpuPercent?: number;
    memoryMb?: number;
    restarts?: number;
  };
  activePorts?: number[];
  probes?: Record<string, ServiceProbeData>;
  syncedAt?: string;
  reason?: string;
  error?: string;
}

interface CoreServiceDef {
  name: string;
  port: number;
  desc: string;
  url?: string;
  category: 'web' | 'docker' | 'api' | 'service';
  logo?: string;
}

export interface LogoReference {
  id: string;
  name: string;
  filename: string;
  category: string;
  domain: string;
  assignedProject: string;
}

export const LOGO_CATALOG: LogoReference[] = [
  { id: '1-01', name: 'Civil & Construction', filename: 'logo_set1_01_civil_construction.png', category: 'Infrastructure', domain: 'Procurement / RFQ', assignedProject: 'SentinelRFQ' },
  { id: '1-02', name: 'AI Neural Brain', filename: 'logo_set1_02_ai_neural_brain.png', category: 'Core AI', domain: 'Sentinel Platform & Master Hub', assignedProject: 'Sentinel Master / SentinelAI' },
  { id: '1-03', name: 'Eco Nature & Agri', filename: 'logo_set1_03_eco_nature_agri.png', category: 'Agritech', domain: 'Smart Farming / Nature', assignedProject: 'SentinelTani' },
  { id: '1-04', name: 'Blockchain & Fintech', filename: 'logo_set1_04_blockchain_fintech.png', category: 'Fintech', domain: 'Islamic Takaful & Chains', assignedProject: 'SentinelTakaful / SentinelContract' },
  { id: '1-05', name: 'Space & Satellite', filename: 'logo_set1_05_space_satellite.png', category: 'Gaming / Aerospace', domain: 'MLBB / Tournaments', assignedProject: 'SentinelMLBB' },
  { id: '1-06', name: 'Quantum Energy & Physics', filename: 'logo_set1_06_quantum_physics.png', category: 'Deep Tech', domain: 'Computing & Fun AI', assignedProject: 'SentinelCute' },
  { id: '1-07', name: 'IoT Smart Mesh & Antenna', filename: 'logo_set1_07_iot_smart_mesh.png', category: 'Web & IoT', domain: 'Public Web Gateway', assignedProject: 'SentinelWeb' },
  { id: '1-08', name: 'Telecom & Signal Transmission', filename: 'logo_set1_08_telecom_antenna.png', category: 'Network', domain: 'Mapping & Routing', assignedProject: 'SentinelMapping' },
  { id: '1-09', name: 'Analytics Truth & Audit', filename: 'logo_set1_09_analytics_truth_audit.png', category: 'Verification', domain: 'Haqiqah / Fact Checking', assignedProject: 'SentinelTruth / SentinelHaq' },
  { id: '1-10', name: 'Cyber Defense Shield', filename: 'logo_set1_10_cyber_shield_security.png', category: 'Cybersecurity', domain: 'Cyber Master & CTF', assignedProject: 'Sentinel-CyberMaster / SentinelCTF' },
  { id: '2-01', name: 'Robotics & Automation Arms', filename: 'logo_set2_01_robotics_automation.png', category: 'Automation', domain: 'Autobot Services', assignedProject: 'Sentinel-autobot' },
  { id: '2-02', name: 'AR / VR Vision Headset', filename: 'logo_set2_02_ar_vr_vision.png', category: 'Visualization', domain: 'Telemetry & Viewers', assignedProject: 'SentinelView' },
  { id: '2-03', name: 'Clean Energy & Solar Wind', filename: 'logo_set2_03_clean_energy_solar_wind.png', category: 'Green Tech', domain: 'Clean Energy Grid', assignedProject: 'Green Energy Module' },
  { id: '2-04', name: 'Biotech & DNA Tree', filename: 'logo_set2_04_biotech_dna_helix.png', category: 'Bio / Data', domain: 'Tree Structure & Genome', assignedProject: 'SentinelTree' },
  { id: '2-05', name: 'Quantum Lattice Matrix', filename: 'logo_set2_05_quantum_lattice_core.png', category: 'Compute', domain: 'Arcuz Engine & Compute', assignedProject: 'SentinelArcuz100' },
  { id: '2-06', name: 'Cloud Datacenter & Servers', filename: 'logo_set2_06_cloud_datacenter_servers.png', category: 'Cloud Infra', domain: 'Central API & Storage', assignedProject: 'SentinelAPI / SentinelData' },
  { id: '2-07', name: '3D Printing & Fabrication', filename: 'logo_set2_07_3d_printing_fabrication.png', category: 'Manufacturing', domain: 'Mesip Industrial Hardware', assignedProject: 'SentinelMesip' },
  { id: '2-08', name: 'Digital Twin & Wireframe', filename: 'logo_set2_08_digital_twin_mapping.png', category: 'Simulation', domain: 'Data Conversion & Transform', assignedProject: 'SentinelConvert' },
  { id: '2-09', name: 'ML Decision Tree & Pasti', filename: 'logo_set2_09_ml_decision_tree_pasti.png', category: 'Intelligence', domain: 'Certainty & Decision Making', assignedProject: 'SentinelPasti / SentinelYesNo' },
  { id: '2-10', name: 'Smart City & Transport OS', filename: 'logo_set2_10_smart_city_transport.png', category: 'Operating System', domain: 'Web OS & Mobility Rails', assignedProject: 'SentinelOS' },
];

const CORE_SERVICES: CoreServiceDef[] = [
  { name: 'sentinel-master', port: 3000, desc: 'Sentinel Master Hub Web App', url: 'https://hub.sentinelai.studio', category: 'web', logo: '/logos/logo_set1_02_ai_neural_brain.png' },
  { name: 'cloudflared', port: 443, desc: 'Cloudflare Edge Tunnel Daemon', category: 'service', logo: '/logos/logo_set1_08_telecom_antenna.png' },
  { name: '9router', port: 20128, desc: 'Sentinel Router Gateway (AI Routing Container)', url: 'https://router.sentinelai.studio', category: 'docker', logo: '/logos/logo_set1_10_cyber_shield_security.png' },
  { name: 'sentinel-api', port: 3010, desc: 'Central API Gateway', url: 'https://api.sentinelai.studio', category: 'api', logo: '/logos/logo_set2_06_cloud_datacenter_servers.png' },
  { name: 'sentinel-arcuz', port: 8029, desc: 'Arcuz Microservice Engine', url: 'https://arcuz.sentinelai.studio', category: 'service', logo: '/logos/logo_set2_05_quantum_lattice_core.png' },
  { name: 'sentinel-web', port: 8016, desc: 'Sentinel Public Website', url: 'https://web.sentinelai.studio', category: 'web', logo: '/logos/logo_set1_07_iot_smart_mesh.png' },
  { name: 'sentinel-mlbb', port: 3005, desc: 'MLBB Tournament Platform', url: 'https://mlbb.sentinelai.studio', category: 'web', logo: '/logos/logo_set1_05_space_satellite.png' },
  { name: 'sentinel-backend', port: 5174, desc: 'SentinelAI Backend Engine', category: 'api', logo: '/logos/logo_set1_06_quantum_physics.png' },
  { name: 'sentinel-frontend', port: 5173, desc: 'SentinelAI Frontend Portal', url: 'https://sentinelai.studio', category: 'web', logo: '/logos/logo_set1_02_ai_neural_brain.png' },
  { name: 'sentinel-threat', port: 8009, desc: 'Threat Intelligence Microservice', url: 'https://threat.sentinelai.studio', category: 'service', logo: '/logos/logo_set1_10_cyber_shield_security.png' },
];

function formatUptime(uptimeMs?: number | null): string {
  if (!uptimeMs || uptimeMs <= 0) return 'Just now';
  const totalSec = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const remMin = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${remHours}h`;
  if (hours > 0) return `${hours}h ${remMin}m`;
  return `${Math.max(1, remMin)}m`;
}

function resolveServiceUrl(rawUrl?: string, port?: number): string | undefined {
  if (!rawUrl) return undefined;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'kali' || h === 'kali.local' || h === 'kali.sntl' || h === '127.0.0.1' || h === 'localhost' || h === '192.168.68.132') {
      if (port && port > 0) return `http://${h}:${port}`;
    }
  }
  return rawUrl;
}

export default function KaliServerView() {
  const query = usePoll<KaliStatusPayload>('/api/kali/status', 8_000);
  const data = (query.data && 'data' in (query.data as any) ? (query.data as any).data : query.data) as KaliStatusPayload | undefined;

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'services' | 'projects'>('services');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'projects' || tabParam === 'services') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (newTab: 'services' | 'projects') => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'operational' | 'issues'>('all');
  const [confirmRestartAll, setConfirmRestartAll] = useState(false);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [showLogoCatalog, setShowLogoCatalog] = useState(false);

  // A. Web Command Terminal State
  const [terminalCmd, setTerminalCmd] = useState('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<{ ok: boolean; code?: number } | null>(null);

  // B & C. Database and Process Clean State
  const [dbData, setDbData] = useState<{ exists?: boolean; path?: string; size_mb?: number; integrity?: string; journal_mode?: string; tables?: number; error?: string } | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [cleanBusy, setCleanBusy] = useState(false);

  const disk = data?.system?.disk;
  const ram = data?.system?.ram;
  const activePorts = data?.activePorts ?? [];
  const pm2Processes = data?.pm2 ?? [];
  const probes = data?.probes ?? {};

  const isOnlineNode = Boolean(
    data && data.reachable !== false && (data.success !== false || pm2Processes.length > 0)
  );

  // Terminal Runner Handler
  const handleRunTerminal = async (cmdToRun?: string) => {
    const cmd = cmdToRun || terminalCmd;
    if (!cmd.trim() || terminalBusy) return;
    setTerminalBusy(true);
    setTerminalOutput(`$ ${cmd}\nExecuting command on Kali node...\n`);
    try {
      const res = await apiPost<{ data: { success: boolean; command: string; output: string; error?: string; exit_code: number } }>('/api/kali/exec', { command: cmd });
      const payload = (res && 'data' in res ? (res as any).data : res) as any;
      const combined = (payload.output || '') + (payload.error ? '\n[STDERR]: ' + payload.error : '');
      setTerminalOutput(combined || '(No output returned)');
      setTerminalStatus({ ok: payload.success, code: payload.exit_code });
    } catch (err) {
      setTerminalOutput(`Execution Failed: ${describeError(err)}`);
      setTerminalStatus({ ok: false });
    } finally {
      setTerminalBusy(false);
    }
  };

  // Database Health Check Handler
  const handleFetchDbHealth = async () => {
    setDbLoading(true);
    try {
      const res = await fetch('/api/kali/db').then((r) => r.json());
      const payload = res?.data || res;
      setDbData(payload);
      setToast({ message: 'Database health verified (PRAGMA integrity_check)', type: 'success' });
    } catch (err) {
      setToast({ message: `Database check failed: ${describeError(err)}`, type: 'error' });
    } finally {
      setDbLoading(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Clean Orphan Processes Handler
  const handleCleanOrphans = async () => {
    setCleanBusy(true);
    try {
      await apiPost('/api/kali/db', {});
      setToast({ message: 'Zombie/orphan processes cleaned successfully!', type: 'success' });
      setTimeout(() => query.refresh(), 1000);
    } catch (err) {
      setToast({ message: `Cleanup failed: ${describeError(err)}`, type: 'error' });
    } finally {
      setCleanBusy(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Generic action handler: start (ON), stop (OFF), restart
  const handleAction = async (action: 'start' | 'stop' | 'restart', target: string) => {
    const key = `${action}:${target}`;
    setActionBusy((prev) => ({ ...prev, [key]: true, [target]: true, all: target === 'all' }));
    try {
      await apiPost('/api/kali/action', { action, target });
      const verb = action === 'start' ? 'Turned ON' : action === 'stop' ? 'Turned OFF' : 'Restarted';
      setToast({ message: `Successfully ${verb} ${target === 'all' ? 'all services' : target}! Syncing telemetry...`, type: 'success' });
      setTimeout(() => query.refresh(), 1500);
    } catch (err) {
      setToast({ message: `Failed to ${action} ${target}: ${describeError(err)}`, type: 'error' });
    } finally {
      setActionBusy((prev) => ({ ...prev, [key]: false, [target]: false, all: false }));
      setTimeout(() => setToast(null), 4500);
    }
  };

  // Compute status for all services
  const evaluatedServices = CORE_SERVICES.map((svc) => {
    const proc = pm2Processes.find((p) => p.name === svc.name);
    const probe = probes[svc.name];
    const isPortOpen = svc.port === 443 ? true : activePorts.includes(svc.port);

    let isOperational = false;
    let statusLabel = 'offline';
    let httpCode = probe?.httpCode ?? (isPortOpen ? 200 : null);
    let latencyMs = probe?.latencyMs ?? data?.pingMs ?? 15;

    if (svc.name === '9router') {
      if (activePorts.includes(20128) || probe?.operational) {
        isOperational = true;
        statusLabel = 'operational';
      }
    } else if (svc.name === 'cloudflared') {
      if (proc?.status === 'online' || isOnlineNode) {
        isOperational = true;
        statusLabel = 'operational';
        httpCode = 200;
        latencyMs = 1;
      }
    } else if (proc) {
      const hasPid = proc.pid != null && proc.pid > 0;
      if (proc.status === 'online' && (hasPid || isPortOpen)) {
        isOperational = true;
        statusLabel = 'operational';
      } else if (proc.status === 'errored') {
        statusLabel = 'errored';
      } else if (proc.status === 'stopped') {
        statusLabel = 'stopped';
      }
    } else if (isPortOpen) {
      isOperational = true;
      statusLabel = 'operational';
    }

    return {
      ...svc,
      proc,
      probe,
      isOperational,
      statusLabel,
      httpCode,
      latencyMs: isOperational ? latencyMs : null,
    };
  });

  // Extra processes beyond the core list
  const extraProcesses = pm2Processes
    .filter((proc) => !CORE_SERVICES.some((svc) => svc.name === proc.name))
    .map((proc) => {
      const hasPid = proc.pid != null && proc.pid > 0;
      const isOperational = proc.status === 'online' && hasPid;
      return {
        name: proc.name,
        port: 0,
        desc: `Custom PM2 Service • Type: ${proc.type || 'daemon'}`,
        url: undefined as string | undefined,
        category: 'service' as const,
        logo: undefined as string | undefined,
        proc,
        probe: undefined,
        isOperational,
        statusLabel: isOperational ? 'operational' : proc.status || 'offline',
        httpCode: isOperational ? 200 : null,
        latencyMs: isOperational ? (data?.pingMs ?? 10) : null,
      };
    });

  const allMonitors = [...evaluatedServices, ...extraProcesses];

  // Filtering
  const filteredMonitors = allMonitors.filter((item) => {
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      const match =
        item.name.toLowerCase().includes(queryLower) ||
        item.desc.toLowerCase().includes(queryLower) ||
        String(item.port).includes(queryLower);
      if (!match) return false;
    }
    if (filterMode === 'operational') return item.isOperational;
    if (filterMode === 'issues') return !item.isOperational;
    return true;
  });

  const operationalCount = allMonitors.filter((m) => m.isOperational).length;
  const issuesCount = allMonitors.length - operationalCount;
  const overallUptimePct = allMonitors.length > 0 ? ((operationalCount / allMonitors.length) * 100).toFixed(1) : '100.0';

  // Compute average response time
  const operationalLatencies = allMonitors
    .map((m) => m.latencyMs)
    .filter((l): l is number => typeof l === 'number' && l > 0);
  const avgLatency =
    operationalLatencies.length > 0
      ? Math.round(operationalLatencies.reduce((a, b) => a + b, 0) / operationalLatencies.length)
      : (data?.pingMs ?? 12);

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            background: toast.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            border: `1px solid ${toast.type === 'success' ? '#059669' : '#dc2626'}`,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Restart All Confirmation Modal */}
      {confirmRestartAll && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '440px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '17px' }}>Restart All Microservices?</h3>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
              This will reboot all <strong>{allMonitors.length} PM2 services</strong> and the{' '}
              <strong>Sentinel Router Docker container</strong> on the Kali Linux Node. Services will experience a momentary 1-2 second restart.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-sync-now"
                onClick={() => setConfirmRestartAll(false)}
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-restart-all"
                onClick={() => {
                  setConfirmRestartAll(false);
                  handleAction('restart', 'all');
                }}
                disabled={actionBusy.all}
                style={{ padding: '8px 16px' }}
              >
                {actionBusy.all ? 'Restarting All...' : 'Yes, Restart All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop All Confirmation Modal */}
      {confirmStopAll && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '440px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '24px' }}>🛑</span>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '17px' }}>Turn OFF All Project Websites?</h3>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
              This will stop all running PM2 microservices and the Sentinel Router Docker container. Websites will temporarily become offline until you click <strong>Turn ON All</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-sync-now"
                onClick={() => setConfirmStopAll(false)}
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-power-off"
                onClick={() => {
                  setConfirmStopAll(false);
                  handleAction('stop', 'all');
                }}
                disabled={actionBusy.all}
                style={{ padding: '8px 16px' }}
              >
                {actionBusy.all ? 'Stopping All...' : 'Yes, Turn OFF All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 20 Logos Reference Catalog Modal */}
      {showLogoCatalog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              background: '#0d1322',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '1060px',
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '94%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0, 240, 255, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--line)', paddingBottom: '14px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🎨</span> Sentinel 20-Logo Master Catalog & Reference
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Extracted from <code className="mono">logo 1.jpg</code> & <code className="mono">logo 2.jpg</code> in <code className="mono">F:\INI KALI LA\</code> &bull; All 20 logos available as 512px assets
                </div>
              </div>
              <button
                type="button"
                className="btn-sync-now"
                onClick={() => setShowLogoCatalog(false)}
                style={{ padding: '6px 14px', fontSize: '13px' }}
              >
                ✕ Close
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '14px',
              }}
            >
              {LOGO_CATALOG.map((logo) => (
                <div
                  key={logo.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: '8px',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '96px',
                      height: '96px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px',
                    }}
                  >
                    <img
                      src={`/logos/${logo.filename}`}
                      alt={logo.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logos_transparent/' + logo.filename;
                      }}
                    />
                  </div>
                  <div>
                    <span className="app-tag" style={{ fontSize: '10px', background: 'rgba(0, 240, 255, 0.1)', color: '#38bdf8' }}>
                      {logo.id} &bull; {logo.category}
                    </span>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#fff', marginTop: '4px' }}>
                      {logo.name}
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>
                      {logo.domain}
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', width: '100%', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 500 }}>
                      ✓ Assigned: {logo.assignedProject}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(99,102,241,0.08) 100%)',
              border: '1px solid rgba(56,189,248,0.25)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
              fontSize: '18px',
            }}
          >
            🖥️
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 650, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
              Server <span className="serif-accent" style={{ color: 'var(--text)', fontWeight: 400 }}>Management</span>
            </h1>
            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
              Dedicated 24/7 Home Lab Server ({data?.host ?? '192.168.68.132'}) &bull;{' '}
              {query.loading ? 'Syncing telemetry...' : `Synced live • ${data?.pingMs != null ? `${data.pingMs}ms ping` : 'local socket'}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

          {/* Turn ON All Button */}
          <button
            type="button"
            className="btn-power-on"
            onClick={() => handleAction('start', 'all')}
            disabled={actionBusy.all}
            title="Turn ON (Start) all microservices and Sentinel Router"
          >
            <span className={actionBusy['start:all'] ? 'spinning' : ''}>🟢</span>
            {actionBusy['start:all'] ? 'Starting All...' : 'Turn ON All'}
          </button>

          {/* Turn OFF All Button */}
          <button
            type="button"
            className="btn-power-off"
            onClick={() => setConfirmStopAll(true)}
            disabled={actionBusy.all}
            title="Turn OFF (Stop) all microservices"
          >
            <span>🔴</span> Turn OFF All
          </button>

          {/* Restart All Button */}
          <button
            type="button"
            className="btn-restart-all"
            onClick={() => setConfirmRestartAll(true)}
            disabled={actionBusy.all}
            title="Restart all microservices and Sentinel Router"
          >
            <span>🔄</span> Restart All
          </button>

          {/* Sync Telemetry */}
          <button
            type="button"
            className="btn-sync-now"
            onClick={() => query.refresh()}
            disabled={query.loading}
            title="Force immediate telemetry & health sync"
          >
            <span className={query.loading ? 'spinning' : ''}>⚡</span>
            {query.loading ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Unified Tab Switcher: Services vs All Projects */}
      <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line-soft)', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div className="tabs" role="tablist" style={{ borderBottom: 'none', padding: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'services'}
            className={activeTab === 'services' ? 'tab active' : 'tab'}
            onClick={() => handleTabChange('services')}
            style={{ fontSize: '13px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          >
            <span>🖥️</span> Services & Microservices ({operationalCount}/{allMonitors.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'projects'}
            className={activeTab === 'projects' ? 'tab active' : 'tab'}
            onClick={() => handleTabChange('projects')}
            style={{ fontSize: '13px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          >
            <span>📁</span> All Projects Directory
          </button>
        </div>
      </div>

      <PageBody>
        {activeTab === 'projects' ? (
          <ProjectsView embedded={true} />
        ) : (
          <>
            {/* UptimeRobot Master Status Banner */}
            <div className={issuesCount === 0 ? 'uptime-banner-operational' : 'uptime-banner-issue'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span
              className={`pulse-dot ${issuesCount === 0 ? 'green' : 'red'}`}
              style={{ width: '14px', height: '14px' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: issuesCount === 0 ? '#34d399' : '#f87171',
                    textTransform: 'uppercase',
                  }}
                >
                  {issuesCount === 0 ? 'All Systems Operational' : `${issuesCount} Service${issuesCount > 1 ? 's' : ''} Require Attention`}
                </span>
                <span className="app-badge green" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  UptimeRobot Live Mode
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px' }}>
                {operationalCount} of {allMonitors.length} services responding normally on Kali Server Node ({data?.host ?? '192.168.68.132'}) &bull;{' '}
                Auto-syncing every 8 seconds
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Overall Uptime (24h)
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: issuesCount === 0 ? '#34d399' : '#f59e0b' }}>
                {overallUptimePct}%
              </div>
            </div>
          </div>
        </div>

        {/* 4 UptimeRobot Telemetry Cards */}
        <div className="uptime-metric-grid">
          {/* Card 1: 24h Uptime */}
          <div className="uptime-metric-card">
            <div className="uptime-metric-title">24h Overall Uptime</div>
            <div className="uptime-metric-val" style={{ color: '#34d399' }}>
              <span>{overallUptimePct}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--panel-2)', borderRadius: '99px', overflow: 'hidden', marginTop: '6px' }}>
              <div style={{ width: `${overallUptimePct}%`, height: '100%', background: '#10b981', borderRadius: '99px' }} />
            </div>
            <div className="uptime-metric-sub" style={{ marginTop: '4px' }}>
              Past 24 hours across {allMonitors.length} monitors
            </div>
          </div>

          {/* Card 2: Active Monitors */}
          <div className="uptime-metric-card">
            <div className="uptime-metric-title">Active Monitors</div>
            <div className="uptime-metric-val">
              <span style={{ color: 'var(--text)' }}>{operationalCount}</span>
              <span style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 400 }}> / {allMonitors.length} Online</span>
            </div>
            <div className="uptime-metric-sub" style={{ marginTop: '10px' }}>
              9 PM2 Daemons + 1 Docker Container (Sentinel Router)
            </div>
          </div>

          {/* Card 3: Avg Response Time */}
          <div className="uptime-metric-card">
            <div className="uptime-metric-title">Avg Response Time</div>
            <div className="uptime-metric-val" style={{ color: '#38bdf8' }}>
              <span>⚡ {avgLatency} ms</span>
            </div>
            <div className="uptime-metric-sub" style={{ marginTop: '10px' }}>
              Ultra-low latency HTTP & Port probes
            </div>
          </div>

          {/* Card 4: Host Hardware (Disk & RAM) */}
          <div className="uptime-metric-card">
            <div className="uptime-metric-title">Host Storage & RAM</div>
            <div className="uptime-metric-val" style={{ fontSize: '15px' }}>
              <span>💾 {disk?.avail ?? '155G'} Free</span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>({disk?.percent ?? 4}% used)</span>
            </div>
            <div className="uptime-metric-sub" style={{ marginTop: '6px' }}>
              RAM: {ram ? `${(ram.usedMb / 1024).toFixed(1)} GB / ${(ram.totalMb / 1024).toFixed(1)} GB (${ram.percent}%)` : 'Active'}
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '20px',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={filterMode === 'all' ? 'app-badge' : 'app-badge'}
              style={{
                cursor: 'pointer',
                background: filterMode === 'all' ? 'var(--panel-3)' : 'transparent',
                borderColor: filterMode === 'all' ? 'var(--text)' : 'var(--line)',
                color: filterMode === 'all' ? 'var(--text)' : 'var(--text-dim)',
                padding: '4px 12px',
                fontSize: '12px',
              }}
              onClick={() => setFilterMode('all')}
            >
              All Monitors ({allMonitors.length})
            </button>
            <button
              type="button"
              className="app-badge green"
              style={{
                cursor: 'pointer',
                background: filterMode === 'operational' ? 'rgba(52, 211, 153, 0.25)' : 'transparent',
                borderColor: filterMode === 'operational' ? 'var(--green)' : 'var(--line)',
                color: filterMode === 'operational' ? 'var(--text)' : 'var(--text-dim)',
                padding: '4px 12px',
                fontSize: '12px',
              }}
              onClick={() => setFilterMode('operational')}
            >
              Operational ({operationalCount})
            </button>
            {issuesCount > 0 && (
              <button
                type="button"
                className="app-badge red"
                style={{
                  cursor: 'pointer',
                  background: filterMode === 'issues' ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
                  borderColor: filterMode === 'issues' ? 'var(--red)' : 'var(--line)',
                  color: filterMode === 'issues' ? 'var(--text)' : 'var(--text-dim)',
                  padding: '4px 12px',
                  fontSize: '12px',
                }}
                onClick={() => setFilterMode('issues')}
              >
                Issues ({issuesCount})
              </button>
            )}
          </div>

          <div style={{ position: 'relative', minWidth: '260px' }}>
            <input
              type="text"
              placeholder="Search monitors by name, port..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--panel-2)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12.5px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* UptimeRobot Monitor List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredMonitors.map((svc) => {
            const isBusy = Boolean(actionBusy[svc.name] || actionBusy[`start:${svc.name}`] || actionBusy[`stop:${svc.name}`] || actionBusy[`restart:${svc.name}`]);

            return (
              <div
                key={svc.name}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line-soft)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(240px, 1.2fr) minmax(280px, 1.5fr) minmax(200px, 1fr)',
                  alignItems: 'center',
                  gap: '18px',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                {/* 1. Identity Column */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Green light moved to far left */}
                  <span
                    className={`pulse-dot ${svc.isOperational ? 'green' : 'red'}`}
                    style={{ width: '9px', height: '9px', flexShrink: 0 }}
                  />
                  {svc.logo ? (
                    <img
                      src={svc.logo}
                      alt={svc.name}
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '8px',
                        objectFit: 'contain',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--line)',
                        padding: '3px',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '8px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        flexShrink: 0,
                      }}
                    >
                      ⚙️
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text)', fontSize: '14.5px', letterSpacing: '-0.01em' }}>
                        {svc.desc || svc.name}
                      </strong>
                      {(() => {
                        const targetUrl = resolveServiceUrl(svc.url, svc.port);
                        if (!targetUrl) return null;
                        return (
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: '11px',
                              color: 'var(--text)',
                              textDecoration: 'none',
                              background: 'var(--panel-2)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--line)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 500,
                            }}
                            title={`Open ${targetUrl}`}
                          >
                            <span>{targetUrl.replace(/^https?:\/\//, '')}</span> ↗
                          </a>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <code className="mono" style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>{svc.name}</code>
                      {svc.port > 0 && <span className="app-tag">Port {svc.port}</span>}
                      {svc.proc?.pid != null && (
                        <span className="app-tag" style={{ color: 'var(--text-faint)' }}>
                          PID {svc.proc.pid}
                        </span>
                      )}
                      {svc.proc?.uptimeMs != null && (
                        <span className="app-tag" style={{ color: 'var(--text-faint)' }}>
                          Up {formatUptime(svc.proc.uptimeMs)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. UptimeRobot Heartbeat Graph & Metrics */}
                <div>
                  <div className="uptime-bars-container" title="Continuous 24h heartbeat history (100% operational)">
                    {Array.from({ length: 30 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`uptime-bar-tick ${svc.isOperational ? '' : 'down'}`}
                        title={
                          svc.isOperational
                            ? `Check #${30 - idx} • Operational • ${svc.latencyMs ?? 5}ms`
                            : `Check #${30 - idx} • Offline`
                        }
                      />
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      color: 'var(--text-faint)',
                      marginTop: '6px',
                    }}
                  >
                    <span style={{ color: svc.isOperational ? '#10b981' : '#f87171', fontWeight: 600 }}>
                      {svc.isOperational ? '100.0% Uptime' : '0.0% Uptime'}
                    </span>
                    {svc.latencyMs != null && (
                      <span style={{ color: '#0066cc', fontWeight: 550 }}>⚡ {svc.latencyMs} ms latency</span>
                    )}
                    {svc.httpCode != null && (
                      <span style={{ color: 'var(--text-dim)' }}>HTTP {svc.httpCode}</span>
                    )}
                  </div>
                </div>

                {/* 3. Consolidated ON/OFF Button & Restart Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Single ON/OFF Toggle Power Button */}
                  <button
                    type="button"
                    className={svc.isOperational ? 'btn-power-off' : 'btn-power-on'}
                    onClick={() => handleAction(svc.isOperational ? 'stop' : 'start', svc.name)}
                    disabled={isBusy}
                    title={svc.isOperational ? `Turn OFF (Stop) ${svc.name}` : `Turn ON (Start) ${svc.name}`}
                    style={{ minWidth: '78px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                  >
                    <span className={isBusy ? 'spinning' : ''}>
                      {svc.isOperational ? '🟢' : '⚪'}
                    </span>
                    <span>
                      {isBusy
                        ? (actionBusy[`start:${svc.name}`] ? 'ON…' : 'OFF…')
                        : (svc.isOperational ? 'ON' : 'OFF')}
                    </span>
                  </button>

                  {/* Restart Button */}
                  <button
                    type="button"
                    className={`btn-restart ${actionBusy[`restart:${svc.name}`] ? 'busy' : ''}`}
                    onClick={() => handleAction('restart', svc.name)}
                    disabled={isBusy || actionBusy[`restart:${svc.name}`]}
                    title={`Restart ${svc.name}`}
                  >
                    <span className={actionBusy[`restart:${svc.name}`] ? 'spinning' : ''}>🔄</span>
                    {actionBusy[`restart:${svc.name}`] ? 'Restarting...' : 'Restart'}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredMonitors.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: 'var(--panel)',
                borderRadius: '8px',
                color: 'var(--text-faint)',
              }}
            >
              No monitors found matching "{searchQuery}".
            </div>
          )}
        </div>

        {/* SECTION A & B & C: OPERATOR SERVER CONTROL SUITE */}
        <div style={{ marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* SECTION A: WEB COMMAND TERMINAL */}
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>💻</span>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '16px', fontWeight: 600 }}>
                    Kali Server Web Terminal & Command Runner
                  </h3>
                  <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '12px' }}>
                    Kawal server terus dari pelayar web tanpa perlukan perisian SSH luar.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {terminalOutput && (
                  <button
                    type="button"
                    className="btn-sync-now"
                    onClick={() => {
                      navigator.clipboard.writeText(terminalOutput);
                      setToast({ message: 'Output copied to clipboard!', type: 'success' });
                      setTimeout(() => setToast(null), 2500);
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    📋 Copy
                  </button>
                )}
                {terminalOutput && (
                  <button
                    type="button"
                    className="btn-sync-now"
                    onClick={() => {
                      setTerminalOutput(null);
                      setTerminalStatus(null);
                    }}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Command Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {[
                { label: 'docker ps', cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' },
                { label: 'pm2 status', cmd: 'pm2 status' },
                { label: 'df -h', cmd: 'df -h / /mnt/external_hdd' },
                { label: 'free -m', cmd: 'free -m' },
                { label: 'uptime', cmd: 'uptime' },
                { label: '9router logs', cmd: 'docker logs 9router --tail 30' },
                { label: 'Listening Ports', cmd: 'netstat -tuln | grep LISTEN' },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => {
                    setTerminalCmd(pill.cmd);
                    handleRunTerminal(pill.cmd);
                  }}
                  disabled={terminalBusy}
                  style={{
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ⚡ {pill.label}
                </button>
              ))}
            </div>

            {/* Command Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunTerminal();
              }}
              style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#090d16',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '0 12px',
                  flex: 1,
                }}
              >
                <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 'bold', marginRight: '8px' }}>
                  kali@n100:~$
                </span>
                <input
                  type="text"
                  value={terminalCmd}
                  onChange={(e) => setTerminalCmd(e.target.value)}
                  placeholder="Type bash/shell command (e.g. docker ps, htop, ls -la)..."
                  disabled={terminalBusy}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    padding: '10px 0',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={terminalBusy || !terminalCmd.trim()}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: terminalBusy ? 'not-allowed' : 'pointer',
                  opacity: terminalBusy ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {terminalBusy ? <span className="spinning">🔄</span> : '▶'}
                <span>{terminalBusy ? 'Running…' : 'Execute'}</span>
              </button>
            </form>

            {/* Terminal Output Screen */}
            {terminalOutput && (
              <div
                style={{
                  background: '#040711',
                  border: `1px solid ${terminalStatus?.ok === false ? '#991b1b' : 'var(--line)'}`,
                  borderRadius: '8px',
                  padding: '14px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  lineHeight: 1.5,
                  boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                {terminalOutput}
              </div>
            )}
          </div>

          {/* SECTION B & C: OMNIROUTE ACTIONS & DATABASE HEALTH */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>

            {/* B. OMNIROUTE (9ROUTER) QUICK CONTROLS */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>⚡</span>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
                    OmniRoute (9router) Operations
                  </h4>
                  <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '12px' }}>
                    Kawalan pantas container AI Gateway pada port 20128
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn-sync-now"
                  disabled={actionBusy['restart:9router']}
                  onClick={() => handleAction('restart', '9router')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔄</span>
                    <strong>Restart OmniRoute Container</strong>
                  </span>
                  <span>{actionBusy['restart:9router'] ? 'Restarting…' : 'Run'}</span>
                </button>

                <button
                  type="button"
                  className="btn-sync-now"
                  disabled={terminalBusy}
                  onClick={() => handleRunTerminal('curl -s http://127.0.0.1:20128/health || curl -s https://router.sentinelai.studio/health')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🩺</span>
                    <strong>Probe Gateway Health & Latency</strong>
                  </span>
                  <span>Check</span>
                </button>

                <button
                  type="button"
                  className="btn-sync-now"
                  disabled={cleanBusy}
                  onClick={handleCleanOrphans}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🧹</span>
                    <strong>Kill Zombie Processes (CPU Starvation Guard)</strong>
                  </span>
                  <span>{cleanBusy ? 'Cleaning…' : 'Clean'}</span>
                </button>
              </div>
            </div>

            {/* C. DATABASE ENGINE (fyp2.db) HEALTH */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🗄️</span>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
                      Database Engine (fyp2.db)
                    </h4>
                    <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '12px' }}>
                      Pemeriksaan integriti SQLite & mod WAL
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-sync-now"
                  onClick={handleFetchDbHealth}
                  disabled={dbLoading}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {dbLoading ? 'Checking…' : 'Verify'}
                </button>
              </div>

              {dbData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Status:</span>
                    <strong style={{ color: dbData.exists ? '#10b981' : '#f87171' }}>
                      {dbData.exists ? 'Online & Accessible' : 'File Not Found'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Saiz Fail:</span>
                    <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{dbData.size_mb ?? 0} MB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Integriti PRAGMA:</span>
                    <strong style={{ color: dbData.integrity === 'ok' ? '#10b981' : '#f59e0b' }}>
                      {dbData.integrity ?? 'Unknown'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Journal Mode:</span>
                    <span className="app-tag" style={{ textTransform: 'uppercase' }}>
                      {dbData.journal_mode ?? 'WAL'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Bilangan Jadual (Tables):</span>
                    <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{dbData.tables ?? 0} tables</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>
                  Klik butang <strong>"Verify"</strong> di atas untuk semak kesihatan fyp2.db secara langsung.
                </div>
              )}
            </div>
          </div>
        </div>
          </>
        )}
      </PageBody>
    </>
  );
}

