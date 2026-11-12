'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from './PageHeader';
import { Badge, Dot } from './ui';
import type {
  OrchestrationRunResult,
  MemoryItem,
  SubagentExecutionResult,
  MemoryCategory,
} from '@/lib/orchestrator/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouterStatus {
  reachable: boolean;
  health: string | null;
  models: string[];
  comboModels?: string[];
}

interface LiveSubagent {
  id: string;
  role: string;
  specialization: string;
  icon: string;
  status: 'idle' | 'planning' | 'running' | 'completed' | 'failed';
  task?: string;
  progress?: number; // 0-100
  tokensOut?: number;
  model?: string;
  startedAt?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  runId?: string;
}

// ─── Specialization registry ──────────────────────────────────────────────────

const SPECIALIZATIONS: Record<string, { icon: string; color: string; label: string }> = {
  recon:       { icon: '🔍', color: '#38bdf8', label: 'Recon' },
  exploit:     { icon: '⚡', color: '#f87171', label: 'Exploit' },
  synthesis:   { icon: '🧬', color: '#a78bfa', label: 'Synthesis' },
  browser:     { icon: '🌐', color: '#34d399', label: 'Browser' },
  memory:      { icon: '🧠', color: '#fbbf24', label: 'Memory' },
  analyst:     { icon: '📊', color: '#60a5fa', label: 'Analyst' },
  writer:      { icon: '✍️', color: '#f472b6', label: 'Writer' },
  supervisor:  { icon: '🎯', color: '#ffffff', label: 'Supervisor' },
  default:     { icon: '🤖', color: '#a1a1a6', label: 'Agent' },
};

function getSpec(role: string) {
  const key = Object.keys(SPECIALIZATIONS).find((k) =>
    role.toLowerCase().includes(k),
  );
  return SPECIALIZATIONS[key ?? 'default'];
}

function elapsedSec(startedAt?: number) {
  if (!startedAt) return 0;
  return Math.floor((Date.now() - startedAt) / 1000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RouterPill({ status }: { status: RouterStatus | null }) {
  if (!status) {
    return (
      <span className="swarm-router-pill offline">
        <Dot tone="grey" /> Router — connecting…
      </span>
    );
  }
  return (
    <span className={`swarm-router-pill ${status.reachable ? 'online' : 'offline'}`}>
      <Dot tone={status.reachable ? 'green' : 'red'} />
      Sentinel Router
      <span className="swarm-router-models">
        {(status.comboModels ?? status.models).length} models
      </span>
    </span>
  );
}

function MemoryPill({ count }: { count: number }) {
  return (
    <span className="swarm-memory-pill">
      🧠 <strong>{count}</strong> memories
    </span>
  );
}

function AgentCard({ agent, elapsed }: { agent: LiveSubagent; elapsed: number }) {
  const spec = getSpec(agent.role);
  const statusColor =
    agent.status === 'running' || agent.status === 'planning'
      ? 'amber'
      : agent.status === 'completed'
      ? 'green'
      : agent.status === 'failed'
      ? 'red'
      : 'grey';

  return (
    <div className={`swarm-agent-card ${agent.status}`}>
      <div className="swarm-agent-header">
        <span className="swarm-agent-icon" style={{ color: spec.color }}>
          {spec.icon}
        </span>
        <div className="swarm-agent-meta">
          <span className="swarm-agent-role">{agent.role}</span>
          <span className="swarm-agent-spec" style={{ color: spec.color }}>
            {spec.label}
          </span>
        </div>
        <Badge tone={statusColor}>{agent.status}</Badge>
      </div>

      {agent.task && (
        <p className="swarm-agent-task">{agent.task}</p>
      )}

      {(agent.status === 'running' || agent.status === 'planning') && (
        <div className="swarm-agent-progress-bar">
          <div
            className="swarm-agent-progress-fill"
            style={{
              width: `${agent.progress ?? 30}%`,
              background: spec.color,
            }}
          />
        </div>
      )}

      <div className="swarm-agent-footer">
        {agent.model && (
          <span className="swarm-agent-model">{agent.model}</span>
        )}
        {agent.status === 'running' && (
          <span className="swarm-agent-elapsed">{elapsed}s</span>
        )}
        {agent.tokensOut !== undefined && (
          <span className="swarm-agent-tokens">{agent.tokensOut} tok</span>
        )}
      </div>
    </div>
  );
}

function MemoryRow({ mem }: { mem: MemoryItem }) {
  const catColor: Record<MemoryCategory, string> = {
    fact: '#60a5fa',
    credential: '#34d399',
    endpoint: '#fbbf24',
    failure: '#f87171',
    reflection: '#a78bfa',
    selector: '#94a3b8',
  };
  return (
    <div className="swarm-mem-row">
      <span
        className="swarm-mem-cat"
        style={{ color: catColor[mem.category] ?? '#a1a1a6' }}
      >
        {mem.category.toUpperCase()}
      </span>
      <span className="swarm-mem-entity">{mem.entity}</span>
      <span className="swarm-mem-fact">{mem.fact}</span>
      <span className="swarm-mem-author">{mem.author}</span>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`swarm-bubble ${isUser ? 'user' : 'assistant'}`}>
      <span className="swarm-bubble-role">{isUser ? 'You' : '🤖 Swarm'}</span>
      <div className="swarm-bubble-content">{msg.content}</div>
      <span className="swarm-bubble-ts">
        {new Date(msg.ts).toLocaleTimeString()}
      </span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resultToAgents(result: OrchestrationRunResult): LiveSubagent[] {
  return result.subagents.map((sub: SubagentExecutionResult) => ({
    id: sub.id,
    role: sub.role,
    specialization: sub.role,
    icon: getSpec(sub.role).icon,
    status: sub.status === 'completed' ? 'completed' : sub.status === 'failed' ? 'failed' : 'idle',
    task: sub.task,
    tokensOut: sub.output ? Math.round(sub.output.length / 4) : 0,
    model: undefined,
  }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SwarmIDEView() {
  // Router + memory status
  const [routerStatus, setRouterStatus] = useState<RouterStatus | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Mission state
  const [goal, setGoal] = useState('');
  const [model, setModel] = useState('sentinel-flagship');
  const [concurrency, setConcurrency] = useState(4);
  const [useBrowser, setUseBrowser] = useState(true);
  const [running, setRunning] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Chat history
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live agents panel
  const [liveAgents, setLiveAgents] = useState<LiveSubagent[]>([]);
  const [agentTick, setAgentTick] = useState(0);

  // Bottom panel tab
  const [bottomTab, setBottomTab] = useState<'memory' | 'output' | 'browser'>('output');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [outputLog, setOutputLog] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<OrchestrationRunResult | null>(null);

  // Memory add form
  const [newEntity, setNewEntity] = useState('');
  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact');

  // Right panel width (resizable)
  const [rightWidth, setRightWidth] = useState(320);
  const [bottomHeight, setBottomHeight] = useState(220);
  const draggingRight = useRef(false);
  const draggingBottom = useRef(false);

  // ── Fetch status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const [orchRes, routerRes] = await Promise.all([
        fetch('/api/orchestrator'),
        fetch('/api/router/credentials'),
      ]);
      if (orchRes.ok) {
        const j = await orchRes.json();
        const d = j.data;
        setIsBusy(Boolean(d.isBusy));
        setMemoryCount(d.memoryCount || 0);
        if (d.availableModels?.length) setAvailableModels(d.availableModels);
        if (d.lastResult) setLastResult(d.lastResult);
      }
      if (routerRes.ok) {
        const j = await routerRes.json();
        setRouterStatus(j.data ?? null);
      }
    } catch {
      // silent
    }
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator/memory');
      if (res.ok) {
        const j = await res.json();
        setMemories(j.data?.items ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    loadMemories();
    const t = setInterval(() => {
      fetchStatus();
      if (bottomTab === 'memory') loadMemories();
    }, 15_000);
    return () => clearInterval(t);
  }, [fetchStatus, loadMemories, bottomTab]);

  // Tick elapsed timers for running agents
  useEffect(() => {
    const t = setInterval(() => setAgentTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Resize handlers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRight.current) {
        const container = document.getElementById('swarm-ide-root');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const newW = rect.right - e.clientX;
        setRightWidth(Math.max(220, Math.min(560, newW)));
      }
      if (draggingBottom.current) {
        const container = document.getElementById('swarm-ide-center');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const newH = rect.bottom - e.clientY;
        setBottomHeight(Math.max(120, Math.min(480, newH)));
      }
    };
    const onUp = () => {
      draggingRight.current = false;
      draggingBottom.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Launch mission ──────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!goal.trim() || running) return;

    const userMsg: ChatMessage = { role: 'user', content: goal.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setRunning(true);
    setOutputLog([]);

    // Seed placeholder agents while running
    const placeholders: LiveSubagent[] = [
      { id: 'sup', role: 'Supervisor', specialization: 'supervisor', icon: '🎯', status: 'planning', task: 'Decomposing goal into subtasks…', progress: 15 },
      ...Array.from({ length: Math.min(concurrency, 4) }, (_, i) => ({
        id: `worker-${i}`,
        role: ['Recon Agent', 'Analyst Agent', 'Browser Agent', 'Writer Agent'][i] ?? `Worker ${i + 1}`,
        specialization: ['recon', 'analyst', 'browser', 'writer'][i] ?? 'default',
        icon: getSpec(['Recon Agent', 'Analyst Agent', 'Browser Agent', 'Writer Agent'][i] ?? '').icon,
        status: 'idle' as const,
        task: 'Awaiting task assignment…',
        startedAt: undefined,
      })),
    ];
    setLiveAgents(placeholders);
    setBottomTab('output');

    const log = (line: string) => {
      setOutputLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
    };

    log(`🚀 Launching swarm — goal: "${goal.trim()}"`);
    log(`⚙️  Model: ${model} | Concurrency: ${concurrency} | Browser: ${useBrowser}`);

    // Animate agents to running after short delay
    setTimeout(() => {
      setLiveAgents((prev) =>
        prev.map((a, i) =>
          i === 0
            ? { ...a, status: 'running', progress: 40, startedAt: Date.now() }
            : { ...a, status: 'running', startedAt: Date.now(), progress: 10 + i * 15 },
        ),
      );
      log('🧠 Supervisor planning complete — dispatching subagents…');
    }, 1200);

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
      if (!res.ok || !json.ok) throw new Error(json.error || 'Orchestration failed');

      const result: OrchestrationRunResult = json.data;
      setLastResult(result);
      setLiveAgents(resultToAgents(result));
      setMemoryCount((prev) => prev + (result.memoriesCreated ?? 0));

      log(`✅ Mission complete — ${result.subagents.length} agents, ${result.durationMs}ms`);
      log(`🧬 Synthesis ready`);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.synthesis,
        ts: Date.now(),
        runId: result.runId,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      await loadMemories();
      setBottomTab('memory');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`❌ Error: ${msg}`);
      setLiveAgents((prev) => prev.map((a) => ({ ...a, status: 'failed' as const })));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ Swarm error: ${msg}`, ts: Date.now() },
      ]);
    } finally {
      setRunning(false);
      setGoal('');
      fetchStatus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleLaunch();
    }
  };

  const handleRetainMemory = async () => {
    if (!newFact.trim()) return;
    try {
      await fetch('/api/orchestrator/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: newEntity.trim() || 'operator', fact: newFact.trim(), category: newCategory }),
      });
      setNewFact('');
      setNewEntity('');
      await loadMemories();
      fetchStatus();
    } catch {
      // silent
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Top bar ── */}
      <PageHeader
        title="AI Swarm IDE"
        subtitle="VS Code-style multi-agent workspace with Sentinel Router & Hindsight Memory"
      >
        <RouterPill status={routerStatus} />
        <MemoryPill count={memoryCount} />
        <Badge tone={isBusy ? 'amber' : 'green'}>{isBusy ? '⚡ Swarm Active' : '● Ready'}</Badge>
      </PageHeader>

      {/* ── IDE body ── */}
      <div id="swarm-ide-root" className="swarm-ide-root">

        {/* ── Center column ── */}
        <div id="swarm-ide-center" className="swarm-ide-center">

          {/* Model / config bar (like VS Code status bar at top of editor) */}
          <div className="swarm-config-bar">
            <label className="swarm-config-label">Model</label>
            <select
              className="swarm-config-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={running}
            >
              <option value="sentinel-flagship">sentinel-flagship</option>
              <option value="sentinel-pentest-hybrid">sentinel-pentest-hybrid</option>
              <option value="deepseek-v4.1">deepseek-v4.1</option>
              <option value="glm-5.3">glm-5.3</option>
              <option value="kimi-3">kimi-3</option>
              {availableModels
                .filter((m) => !['sentinel-flagship', 'sentinel-pentest-hybrid', 'deepseek-v4.1', 'glm-5.3', 'kimi-3'].includes(m))
                .map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <label className="swarm-config-label">Workers</label>
            <input
              type="number"
              min={1}
              max={8}
              className="swarm-config-num"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={running}
            />

            <label className="swarm-config-toggle">
              <input
                type="checkbox"
                checked={useBrowser}
                onChange={(e) => setUseBrowser(e.target.checked)}
                disabled={running}
              />
              <span>Browser</span>
            </label>
          </div>

          {/* Chat area */}
          <div className="swarm-chat-area">
            {messages.length === 0 && (
              <div className="swarm-chat-empty">
                <div className="swarm-chat-empty-icon">🧠</div>
                <div className="swarm-chat-empty-title">Sentinel AI Swarm IDE</div>
                <div className="swarm-chat-empty-sub">
                  Type a mission goal below. The supervisor will decompose it and dispatch
                  simultaneous subagents — each with their own specialization.
                </div>
                <div className="swarm-chat-empty-hint">⌘↵ or Ctrl+↵ to launch</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className="swarm-input-bar">
            <textarea
              className="swarm-input-textarea"
              rows={3}
              placeholder="Enter mission goal… (⌘↵ to launch)"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
            />
            <button
              type="button"
              className={`swarm-launch-btn ${running ? 'running' : ''}`}
              disabled={running || !goal.trim()}
              onClick={() => void handleLaunch()}
            >
              {running ? (
                <>
                  <span className="swarm-spinner" />
                  Running…
                </>
              ) : (
                <>⚡ Launch Swarm</>
              )}
            </button>
          </div>

          {/* Bottom panel (terminal-style) */}
          <div className="swarm-bottom-panel" style={{ height: bottomHeight }}>
            {/* Resize handle */}
            <div
              className="swarm-resize-h"
              onMouseDown={() => { draggingBottom.current = true; }}
            />

            {/* Tab bar */}
            <div className="swarm-bottom-tabs">
              {(['output', 'memory', 'browser'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`swarm-bottom-tab ${bottomTab === t ? 'active' : ''}`}
                  onClick={() => setBottomTab(t)}
                >
                  {t === 'output' ? '📋 Output' : t === 'memory' ? `🧠 Memory (${memories.length})` : '🌐 Browser'}
                </button>
              ))}
              <span style={{ marginLeft: 'auto' }} />
              {bottomTab === 'memory' && (
                <button type="button" className="swarm-bottom-action" onClick={() => void loadMemories()}>
                  ↻ Refresh
                </button>
              )}
            </div>

            {/* Panel content */}
            <div className="swarm-bottom-content">
              {bottomTab === 'output' && (
                <div className="swarm-output-log">
                  {outputLog.length === 0 && lastResult && (
                    <>
                      <div className="swarm-log-line dim">Last run: {lastResult.runId}</div>
                      <div className="swarm-log-line dim">Status: {lastResult.status} | {lastResult.durationMs}ms | {lastResult.subagents.length} agents</div>
                      <div className="swarm-log-line">{lastResult.synthesis}</div>
                    </>
                  )}
                  {outputLog.length === 0 && !lastResult && (
                    <div className="swarm-log-line dim">No output yet. Launch a swarm mission to see live logs.</div>
                  )}
                  {outputLog.map((line, i) => (
                    <div key={i} className={`swarm-log-line ${line.includes('❌') ? 'err' : line.includes('✅') ? 'ok' : ''}`}>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {bottomTab === 'memory' && (
                <div className="swarm-memory-panel">
                  <div className="swarm-memory-add">
                    <input
                      type="text"
                      className="swarm-mem-input"
                      placeholder="Entity (e.g. 192.168.1.1)"
                      value={newEntity}
                      onChange={(e) => setNewEntity(e.target.value)}
                    />
                    <select
                      className="swarm-mem-select"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                    >
                      <option value="fact">Fact</option>
                      <option value="credential">Credential</option>
                      <option value="endpoint">Endpoint</option>
                      <option value="failure">Failure</option>
                    </select>
                    <input
                      type="text"
                      className="swarm-mem-input flex1"
                      placeholder="Fact to retain…"
                      value={newFact}
                      onChange={(e) => setNewFact(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleRetainMemory(); }}
                    />
                    <button type="button" className="swarm-mem-add-btn" onClick={() => void handleRetainMemory()}>
                      + Retain
                    </button>
                  </div>
                  <div className="swarm-memory-list">
                    {memories.length === 0 && (
                      <div className="swarm-log-line dim">No memories yet.</div>
                    )}
                    {memories.map((mem) => (
                      <MemoryRow key={mem.id} mem={mem} />
                    ))}
                  </div>
                </div>
              )}

              {bottomTab === 'browser' && (
                <div className="swarm-log-line dim" style={{ padding: '12px 16px' }}>
                  Browser actions are dispatched automatically by browser-enabled subagents during a mission.
                  Launch a swarm with Browser enabled to see results here.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Resize handle (vertical) ── */}
        <div
          className="swarm-resize-v"
          onMouseDown={() => { draggingRight.current = true; }}
        />

        {/* ── Right panel — live subagents ── */}
        <div className="swarm-right-panel" style={{ width: rightWidth }}>
          <div className="swarm-right-header">
            <span className="swarm-right-title">SUBAGENTS</span>
            <span className="swarm-right-count">
              {liveAgents.filter((a) => a.status === 'running' || a.status === 'planning').length} active
            </span>
          </div>

          <div className="swarm-agents-list">
            {liveAgents.length === 0 && (
              <div className="swarm-agents-empty">
                <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
                  Subagents appear here when a swarm mission is running
                </div>
              </div>
            )}
            {liveAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                elapsed={agentTick > 0 ? elapsedSec(agent.startedAt) : 0}
              />
            ))}
          </div>

          {/* Router info section */}
          <div className="swarm-right-section">
            <div className="swarm-right-section-title">SENTINEL ROUTER</div>
            {routerStatus ? (
              <>
                <div className="swarm-router-info-row">
                  <Dot tone={routerStatus.reachable ? 'green' : 'red'} />
                  <span>{routerStatus.reachable ? 'Connected :20128' : 'Unreachable'}</span>
                </div>
                {routerStatus.health && (
                  <div className="swarm-router-info-row dim">{routerStatus.health}</div>
                )}
                <div className="swarm-router-models-list">
                  {(routerStatus.comboModels ?? routerStatus.models).slice(0, 8).map((m) => (
                    <span key={m} className={`swarm-model-chip ${m === model ? 'active' : ''}`}>
                      {m}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="swarm-router-info-row dim">Connecting to router…</div>
            )}
          </div>

          {/* Memory summary */}
          <div className="swarm-right-section">
            <div className="swarm-right-section-title">HINDSIGHT MEMORY</div>
            <div className="swarm-router-info-row">
              <span style={{ color: '#fbbf24' }}>🧠</span>
              <span>{memoryCount} entries in ledger</span>
            </div>
            <div className="swarm-router-info-row dim">Cross-agent persistent store</div>
          </div>
        </div>
      </div>
    </>
  );
}
