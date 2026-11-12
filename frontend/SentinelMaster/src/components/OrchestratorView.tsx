'use client';

import { useState, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat, Badge, Alert, Tabs, Loading } from './ui';
import type { OrchestrationRunResult, MemoryItem, BrowserActionResult } from '@/lib/orchestrator/types';

export default function OrchestratorView() {
  const [activeTab, setActiveTab] = useState<'mission' | 'memory' | 'browser'>('mission');

  // Stats & Router info
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<OrchestrationRunResult | null>(null);

  // Mission Dispatch Form
  const [goal, setGoal] = useState('Audit target website, discover login endpoints, check interactive elements, and synthesize defensive findings');
  const [model, setModel] = useState('sentinel-flagship');
  const [concurrency, setConcurrency] = useState(4);
  const [useBrowser, setUseBrowser] = useState(true);
  const [runningMission, setRunningMission] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);

  // Memory Tab State
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [reflecting, setReflecting] = useState(false);
  const [newEntity, setNewEntity] = useState('');
  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState<'fact' | 'credential' | 'endpoint' | 'failure'>('fact');

  // Browser Tab State
  const [browserUrl, setBrowserUrl] = useState('https://news.ycombinator.com');
  const [browserCommand, setBrowserCommand] = useState('');
  const [browserResult, setBrowserResult] = useState<BrowserActionResult | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/orchestrator');
      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        setIsBusy(Boolean(data.isBusy));
        setMemoryCount(data.memoryCount || 0);
        if (data.availableModels?.length) {
          setAvailableModels(data.availableModels);
        }
        if (data.lastResult) {
          setLastResult(data.lastResult);
        }
      }
    } catch (err) {
      console.error('Failed to load orchestrator status:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMemories = async () => {
    try {
      const q = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await fetch(`/api/orchestrator/memory${q}`);
      if (res.ok) {
        const json = await res.json();
        setMemories(json.data.items || []);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    loadMemories();
  }, []);

  const handleLaunchMission = async () => {
    if (!goal.trim()) return;
    setRunningMission(true);
    setMissionError(null);

    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          supervisorModel: model,
          subagentModel: model,
          concurrencyLimit: concurrency,
          useBrowser,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Orchestration execution failed');
      }

      setLastResult(json.data);
      fetchStatus();
      loadMemories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMissionError(msg);
    } finally {
      setRunningMission(false);
    }
  };

  const handleRetainMemory = async () => {
    if (!newFact.trim()) return;
    try {
      const res = await fetch('/api/orchestrator/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: newEntity.trim() || 'operator',
          fact: newFact.trim(),
          category: newCategory,
        }),
      });
      if (res.ok) {
        setNewFact('');
        setNewEntity('');
        loadMemories();
        fetchStatus();
      }
    } catch (err) {
      console.error('Error retaining memory:', err);
    }
  };

  const handleTriggerReflect = async () => {
    setReflecting(true);
    try {
      const res = await fetch('/api/orchestrator/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reflect', model }),
      });
      if (res.ok) {
        loadMemories();
        fetchStatus();
      }
    } catch (err) {
      console.error('Reflection failed:', err);
    } finally {
      setReflecting(false);
    }
  };

  const handleBrowserNavigate = async () => {
    if (!browserUrl.trim()) return;
    setBrowserLoading(true);
    try {
      const res = await fetch('/api/orchestrator/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: browserUrl.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setBrowserResult(json.data);
      }
    } catch (err) {
      console.error('Browser navigate failed:', err);
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleBrowserAction = async () => {
    if (!browserCommand.trim()) return;
    setBrowserLoading(true);
    try {
      const res = await fetch('/api/orchestrator/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: browserCommand.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setBrowserResult(json.data);
        setBrowserCommand('');
      }
    } catch (err) {
      console.error('Browser action failed:', err);
    } finally {
      setBrowserLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="AI Swarm Orchestration & Memory"
        subtitle="Simultaneous multi-agent task execution, Hindsight cognitive memory, and Jev headless browser automation"
      >
        <Badge tone={isBusy ? 'amber' : 'green'}>{isBusy ? 'Swarm Active' : 'Ready'}</Badge>
      </PageHeader>

      <PageBody>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Stat label="Hindsight Memories" value={memoryCount} foot="Cross-agent persistent ledger" />
          <Stat label="Concurrency Pool" value={`${concurrency} Subagents`} foot="Simultaneous execution limit" />
          <Stat label="Model Engine" value={model} foot="Routed via Sentinel Router :20128" />
          <Stat label="Headless Browser" value={useBrowser ? 'Jev Ultrafast' : 'Disabled'} foot="DOM-indexed atomic actions" />
        </div>

        <Tabs
          items={[
            { id: 'mission', label: '🚀 Swarm Mission Control' },
            { id: 'memory', label: `🧠 Hindsight Memory (${memoryCount})` },
            { id: 'browser', label: '⚡ Jev Headless Browser' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'mission' | 'memory' | 'browser')}
        />

        {activeTab === 'mission' && (
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Card title="Launch Autonomous Swarm Mission">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Primary Goal / Mission Objective:
                  </label>
                  <textarea
                    rows={3}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Enter objective for the supervisor to decompose..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>Model:</label>
                    <select
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    >
                      <option value="sentinel-flagship">sentinel-flagship (DeepSeek-V4 Pro)</option>
                      <option value="deepseek-v4.1">deepseek-v4.1</option>
                      <option value="glm-5.2">glm-5.2 (Zhipu)</option>
                      <option value="kimi-3">kimi-3 (Moonshot Code)</option>
                      {availableModels
                        .filter((m) => !['sentinel-flagship', 'deepseek-v4.1', 'glm-5.2', 'kimi-3'].includes(m))
                        .map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Max Simultaneous Subagents:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="useBrowserCheck"
                      checked={useBrowser}
                      onChange={(e) => setUseBrowser(e.target.checked)}
                    />
                    <label htmlFor="useBrowserCheck" style={{ fontWeight: 600, cursor: 'pointer' }}>
                      Enable Jev Headless Browser
                    </label>
                  </div>
                </div>

                {missionError && <Alert kind="error">{missionError}</Alert>}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={runningMission || !goal.trim()}
                    onClick={handleLaunchMission}
                    style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}
                  >
                    {runningMission ? '🚀 Swarm Running Simultaneously...' : '⚡ Launch Swarm'}
                  </button>
                  {runningMission && <Loading label="Supervisor planning and executing subagents concurrently..." />}
                </div>
              </div>
            </Card>

            {lastResult && (
              <>
                <Card
                  title={`Mission Results: ${lastResult.runId}`}
                  actions={
                    <Badge tone={lastResult.status === 'completed' ? 'green' : 'amber'}>
                      {lastResult.status.toUpperCase()} ({lastResult.durationMs}ms)
                    </Badge>
                  }
                >
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>Executive Synthesis</h4>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '1rem', background: 'var(--surface-sunken, rgba(0,0,0,0.05))', borderRadius: '6px' }}>
                      {lastResult.synthesis}
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)' }}>
                    Simultaneous Subagents Execution ({lastResult.subagents.length} workers)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    {lastResult.subagents.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '1rem',
                          background: 'var(--surface, inherit)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <strong style={{ fontSize: '1rem' }}>{sub.role}</strong>
                          <Badge tone={sub.status === 'completed' ? 'green' : 'red'}>
                            {sub.executionTimeMs}ms
                          </Badge>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          <strong>Task:</strong> {sub.task}
                        </div>
                        <div
                          style={{
                            fontSize: '0.875rem',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '220px',
                            overflowY: 'auto',
                            padding: '0.5rem',
                            background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
                            borderRadius: '4px',
                          }}
                        >
                          {sub.output}
                        </div>
                        {sub.browserActions && sub.browserActions.length > 0 && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            🌐 {sub.browserActions.length} browser actions performed ({sub.browserActions[0]?.elements.length} DOM elements indexed)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {activeTab === 'memory' && (
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Card
              title="Hindsight Collective Memory Explorer"
              actions={
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={reflecting}
                  onClick={handleTriggerReflect}
                >
                  {reflecting ? 'Reflecting...' : '✨ Trigger Reflection'}
                </button>
              }
            >
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <input
                  type="text"
                  placeholder="Query memory (e.g. target, credentials, failures)..."
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="button" className="btn secondary" onClick={loadMemories}>
                  Search
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {memories.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No memories recorded yet.</p>
                ) : (
                  memories.map((mem) => (
                    <div
                      key={mem.id}
                      style={{
                        padding: '0.75rem 1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Badge tone={mem.category === 'credential' ? 'green' : mem.category === 'failure' ? 'red' : mem.category === 'reflection' ? 'violet' : 'grey'}>
                            {mem.category.toUpperCase()}
                          </Badge>
                          <strong>{mem.entity}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>by {mem.author}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(mem.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{mem.fact}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card title="Retain New Knowledge Manually">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="Entity / Target (e.g. 192.168.1.1 or api.domain.com)"
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                />
                <select
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                >
                  <option value="fact">Fact</option>
                  <option value="credential">Credential</option>
                  <option value="endpoint">Endpoint</option>
                  <option value="failure">Failure</option>
                </select>
              </div>
              <textarea
                rows={2}
                placeholder="Fact / lesson learned to retain for all subagents..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit', marginBottom: '0.75rem' }}
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
              />
              <button type="button" className="btn primary sm" onClick={handleRetainMemory}>
                Retain Fact
              </button>
            </Card>
          </div>
        )}

        {activeTab === 'browser' && (
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Card title="Jev Ultrafast Headless Browser Runner">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Indexes interactive DOM elements into indexed integers ([0], [1], [2]) and runs millisecond atomic operations.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Target URL..."
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                />
                <button type="button" className="btn primary" disabled={browserLoading} onClick={handleBrowserNavigate}>
                  {browserLoading ? 'Loading...' : 'Navigate & Index'}
                </button>
              </div>

              {browserResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--surface-sunken, rgba(0,0,0,0.05))', borderRadius: '6px' }}>
                    <strong>Title:</strong> {browserResult.pageTitle} | <strong>URL:</strong> {browserResult.currentUrl}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Atomic Action: CLICK <idx>, TYPE_TEXT <idx> <text>, EXTRACT"
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input, inherit)', color: 'inherit' }}
                      value={browserCommand}
                      onChange={(e) => setBrowserCommand(e.target.value)}
                    />
                    <button type="button" className="btn secondary" disabled={browserLoading} onClick={handleBrowserAction}>
                      Execute Action
                    </button>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>Indexed Interactive DOM Space ({browserResult.elements.length} elements):</h4>
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {browserResult.elements.map((el) => (
                        <div key={el.index} style={{ padding: '0.2rem 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <strong>[{el.index}]</strong> &lt;{el.tagName.toUpperCase()}&gt; {el.text} {el.name ? `name="${el.name}"` : ''} {el.href ? `href="${el.href}"` : ''}
                        </div>
                      ))}
                    </div>
                  </div>

                  {browserResult.extractedText && (
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem 0' }}>Page Text Extraction:</h4>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.5rem', fontSize: '0.85rem' }}>
                        {browserResult.extractedText}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}
