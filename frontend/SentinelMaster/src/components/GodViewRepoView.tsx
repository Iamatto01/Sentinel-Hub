'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';
import type { GodViewNode } from '@/app/api/god-view/route';

const CLUSTER_NAMES: Record<string, { label: string; icon: string; color: string }> = {
  core: { label: 'Core Platform', icon: '🏛️', color: '#4f8cff' },
  ai_agents: { label: 'AI & Autonomous Agents', icon: '🔮', color: '#a78bfa' },
  web3_contract: { label: 'Web3 & Smart Contracts', icon: '⛓️', color: '#38bdf8' },
  media_creative: { label: 'Creative & Media Studios', icon: '🎨', color: '#ec4899' },
  kali_ops: { label: 'Kali Linux & Cyber Operations', icon: '🛡️', color: '#f59e0b' },
  utilities: { label: 'Data & Utilities', icon: '📦', color: '#10b981' },
};

export default function GodViewRepoView() {
  const [nodes, setNodes] = useState<GodViewNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GodViewNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchGodView = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/god-view');
      if (res.ok) {
        const json = await res.json();
        if (json.data?.nodes) {
          setNodes(json.data.nodes);
          if (json.data.nodes.length > 0 && !selectedNode) {
            setSelectedNode(json.data.nodes[0]);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGodView();
  }, []);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchesSearch =
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.branch && n.branch.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCluster = clusterFilter === 'all' || n.cluster === clusterFilter;
      return matchesSearch && matchesCluster;
    });
  }, [nodes, searchQuery, clusterFilter]);

  const launchAction = async (cmd: string) => {
    try {
      setActionNotice(`Executing: ${cmd}...`);
      await fetch('/api/touch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      setTimeout(() => setActionNotice(null), 3000);
    } catch {
      setActionNotice('Action command failed.');
    }
  };

  return (
    <>
      <PageHeader
        title="God View — Ecosystem Repository Matrix"
        subtitle="Omniscient Repository Topology · Real-Time Git Health, Workspace Branches & Dispatch Control"
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn sm ghost"
            onClick={fetchGodView}
            disabled={loading}
          >
            {loading ? 'Scanning...' : '🔄 Rescan Matrix'}
          </button>
          <a
            href="/github"
            className="btn sm ghost"
          >
            ◆ GitHub Sync ↗
          </a>
          <a
            href="/projects"
            className="btn sm ghost"
          >
            📁 All Projects
          </a>
        </div>
      </PageHeader>

      <PageBody>
        {actionNotice ? <div className="alert ok" style={{ marginBottom: 16 }}>{actionNotice}</div> : null}

        {/* Omniscient Metrics */}
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <Stat label="Total Repositories" value={String(nodes.length)} foot="Under F:\INI KALI LA root" />
              <Stat
                label="Git Tracked"
                value={String(nodes.filter((n) => n.isRepo).length)}
                foot={`${nodes.filter((n) => n.status === 'dirty').length} dirty repositories`}
              />
              <Stat
                label="Ecosystem Health"
                value={`${Math.round(((nodes.length - nodes.filter((n) => n.status === 'dirty').length) / (nodes.length || 1)) * 100)}%`}
                foot="Clean git working trees"
              />
              <Stat label="Active Cluster Count" value="6 Core Sectors" foot="Organized topology" />
            </div>

        {/* Filter & Search Bar */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories by name or branch..."
              className="input"
              style={{ flex: 1, minWidth: 240 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn sm ${clusterFilter === 'all' ? 'primary' : 'ghost'}`}
                onClick={() => setClusterFilter('all')}
              >
                All Sectors ({nodes.length})
              </button>
              {Object.entries(CLUSTER_NAMES).map(([key, info]) => {
                const count = nodes.filter((n) => n.cluster === key).length;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`btn sm ${clusterFilter === key ? 'primary' : 'ghost'}`}
                    onClick={() => setClusterFilter(key)}
                  >
                    {info.icon} {info.label.split(' ')[0]} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Main Matrix Grid */}
        <div className="grid cols-12" style={{ gap: 20 }}>
          {/* Left: Repositories Visual Matrix (8 Cols) */}
          <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              <Card>Scanning repository topology...</Card>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {filteredNodes.map((node) => {
                  const cluster = CLUSTER_NAMES[node.cluster] || CLUSTER_NAMES.utilities;
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: isSelected ? 'var(--panel-3)' : 'var(--panel)',
                        border: isSelected
                          ? `2px solid ${cluster.color}`
                          : '1px solid var(--line)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? `0 0 15px ${cluster.color}33` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{cluster.icon}</span>
                        <span
                          className={`badge ${
                            node.status === 'healthy'
                              ? 'green'
                              : node.status === 'dirty'
                              ? 'amber'
                              : node.status === 'unpushed'
                              ? 'blue'
                              : 'red'
                          }`}
                        >
                          {node.status}
                        </span>
                      </div>

                      <strong
                        style={{
                          fontSize: 13,
                          display: 'block',
                          color: isSelected ? '#fff' : 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {node.name}
                      </strong>

                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-faint)',
                          fontFamily: 'var(--mono)',
                          marginTop: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{node.branch || 'no git'}</span>
                        {node.changedFiles > 0 ? (
                          <span style={{ color: 'var(--amber)' }}>+{node.changedFiles} dirty</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Repository Inspector Drawer (4 Cols) */}
          <div style={{ gridColumn: 'span 4' }}>
            <Card style={{ position: 'sticky', top: 20 }}>
              {selectedNode ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>
                      {CLUSTER_NAMES[selectedNode.cluster]?.icon || '📦'}
                    </span>
                    <div>
                      <h3 style={{ fontSize: 15 }}>{selectedNode.name}</h3>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {CLUSTER_NAMES[selectedNode.cluster]?.label}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, marginBottom: 16 }}>
                    <div>
                      <span style={{ color: 'var(--text-faint)' }}>Path:</span>{' '}
                      <code style={{ fontSize: 11 }}>{selectedNode.path}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-faint)' }}>Git Branch:</span>{' '}
                      <strong>{selectedNode.branch || 'None'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-faint)' }}>Changed Files:</span>{' '}
                      <span style={{ color: selectedNode.changedFiles > 0 ? 'var(--amber)' : 'var(--green)' }}>
                        {selectedNode.changedFiles} files
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-faint)' }}>Remote:</span>{' '}
                      <span style={{ wordBreak: 'break-all', color: 'var(--text-dim)' }}>
                        {selectedNode.remoteUrl || 'No remote configured'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <h4 style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Quick Dispatch:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => launchAction(`code "${selectedNode.path}"`)}
                    >
                      💻 Open in VS Code
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => launchAction(`explorer "${selectedNode.path}"`)}
                    >
                      📁 Open in File Explorer
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => launchAction(`start wt -d "${selectedNode.path}"`)}
                    >
                      ⚡ Open in Terminal
                    </button>
                  </div>

                  {/* Inter-Project Synergy Assist */}
                  <h4 style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>🤝 Inter-Project Synergy:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={async () => {
                        setActionNotice(`SentinelThreat scanning ${selectedNode.name}...`);
                        const res = await fetch('/api/synergy/audit', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ project: selectedNode.name }),
                        });
                        const j = await res.json();
                        setActionNotice(`SentinelThreat Shield: Score ${j.data?.score}/100 - ${j.data?.summary}`);
                      }}
                    >
                      🛡️ SentinelThreat Shield Audit
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={async () => {
                        setActionNotice(`HyperFrames generating promo for ${selectedNode.name}...`);
                        const res = await fetch('/api/synergy/promo', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ project: selectedNode.name }),
                        });
                        const j = await res.json();
                        setActionNotice(`HyperFrames generated 60fps code-to-video for ${j.data?.projectName}!`);
                      }}
                    >
                      🎬 HyperFrames Promo Video
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={async () => {
                        setActionNotice(`Grok Bot reviewing git state of ${selectedNode.name}...`);
                        const res = await fetch('/api/synergy/review', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ project: selectedNode.name }),
                        });
                        const j = await res.json();
                        setActionNotice(`Grok Review: ${j.data?.reviewNotes}`);
                      }}
                    >
                      🤖 Grok Bot Commit Review
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)' }}>
                  Select any repository from the matrix to inspect details and dispatch actions.
                </div>
              )}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
