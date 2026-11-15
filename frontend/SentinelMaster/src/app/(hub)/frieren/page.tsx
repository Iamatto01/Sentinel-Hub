'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import FrierenAvatar, { type FrierenMood } from '@/components/FrierenAvatar';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
}

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface FleetService {
  name: string;
  port: number;
  supervisor: 'PM2' | 'Docker' | 'systemd';
  href?: string;
  desc: string;
}

const FLEET_SERVICES: FleetService[] = [
  { name: 'Sentinel Master Hub', port: 3000, supervisor: 'PM2', href: '/', desc: 'Command Dashboard' },
  { name: 'OmniRoute Gateway', port: 20128, supervisor: 'Docker', href: '/router', desc: 'Multi-Provider Router' },
  { name: 'SentinelAI Backend', port: 5000, supervisor: 'PM2', href: '/sentinelai', desc: 'Security Engine' },
  { name: 'SentinelAPI', port: 3010, supervisor: 'PM2', desc: 'Telegram Bot & Reseller' },
  { name: 'SentinelTree', port: 8007, supervisor: 'PM2', href: '/tree', desc: 'Family Lineage Studio' },
  { name: 'SentinelAlong', port: 8028, supervisor: 'PM2', href: '/along', desc: 'CAD Floorplan Sketcher' },
  { name: 'Sentinel CTF', port: 8023, supervisor: 'PM2', href: '/ctf', desc: 'Cybersecurity Range' },
  { name: 'Sentinel MLBB', port: 3005, supervisor: 'PM2', href: '/mlbb', desc: 'Game Bot & Analytics' },
  { name: 'MSF RPC Daemon', port: 55553, supervisor: 'systemd', desc: 'Metasploit localhost RPC' },
];

const OMNIROUTE_MODELS = [
  { id: 'antigravity/gemini-3.8-flash-high', label: 'gemini-3.8-flash-high', provider: 'Google DeepMind • Ultra Fast' },
  { id: 'antigravity/gemini-3-flash', label: 'gemini-3-flash', provider: 'Google DeepMind • Low Latency' },
  { id: 'auto/best-chat', label: 'auto/best-chat', provider: 'OmniRoute • Best Chat Cascade' },
  { id: 'auto/smart', label: 'auto/smart', provider: 'OmniRoute • Smart Reasoning' },
  { id: 'kiro/claude-sonnet-4.5', label: 'claude-sonnet-4.5', provider: 'Anthropic • Frontier Logic' },
  { id: 'deepseek-v4.1', label: 'deepseek-v4.1', provider: 'DeepSeek • Code Synthesis' },
];

const DEFAULT_TODOS: TodoItem[] = [
  { id: 't1', text: 'Monitor OmniRoute provider pooling on port 20128', done: true },
  { id: 't2', text: 'Verify fyp2.db SQLite WAL mode & checkpoint health', done: true },
  { id: 't3', text: 'Audit PM2 process memory caps across Sentinel Fleet', done: false },
  { id: 't4', text: 'Cast Zoltraak spell to eliminate lingering zombie tasks', done: false },
  { id: 't5', text: 'Review Cloudflare Tunnel routes for ssh.sentinelai.studio', done: false },
];

export default function FrierenAiosPage() {
  const [selectedModel, setSelectedModel] = useState<string>('antigravity/gemini-3.8-flash-high');
  const [mood, setMood] = useState<FrierenMood>('calm');
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'launcher' | 'fleet' | 'todos'>('launcher');
  const [todos, setTodos] = useState<TodoItem[]>(DEFAULT_TODOS);
  const [newTodoText, setNewTodoText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-init',
      role: 'assistant',
      content:
        'Greetings, Jack. Welcome to the Frieren AIOS Neural Workspace. I have integrated my ancient grimoires directly with the OmniRoute AI gateway on port 20128 and the Sentinel Fleet.\n\nYou can issue fleet commands, audit SQLite database checkpoints, manage server services, or explore code optimizations with me.',
      model: 'antigravity/gemini-3.8-flash-high',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore persisted todos
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sentinel_frieren_todos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) setTodos(parsed);
      }
    } catch {
      // Ignore
    }
  }, []);

  const saveTodos = (updated: TodoItem[]) => {
    setTodos(updated);
    try {
      localStorage.setItem('sentinel_frieren_todos', JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const addTodo = () => {
    const text = newTodoText.trim();
    if (!text) return;
    const item: TodoItem = { id: `todo-${Date.now()}`, text, done: false };
    saveTodos([item, ...todos]);
    setNewTodoText('');
  };

  const toggleTodo = (id: string) => {
    const updated = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    saveTodos(updated);
  };

  const deleteTodo = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    saveTodos(updated);
  };

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const q = (textToSend ?? inputMsg).trim();
      if (!q || isLoading) return;

      setInputMsg('');
      setIsLoading(true);
      setMood('analyzing');

      const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const userMsgItem: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: q,
        timestamp: userTime,
      };

      setMessages((prev) => [...prev, userMsgItem]);

      try {
        const res = await fetch('/api/frieren/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: q,
            model: selectedModel,
            history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const reply = json.data?.reply || 'I heard your request, Jack.';
          const modelUsed = json.data?.model || selectedModel;
          const time = json.data?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: reply,
              model: modelUsed,
              timestamp: time,
            },
          ]);
          setMood('calm');
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: 'The OmniRoute mana flow was interrupted (port 20128). Please check gateway logs.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          setMood('calm');
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Network interruption: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setMood('calm');
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [inputMsg, isLoading, messages, selectedModel],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 48px)',
        width: '100%',
        padding: '16px',
        gap: '16px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ── Top Bar Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(18, 16, 28, 0.72)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(167, 139, 250, 0.22)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 10px #10b981',
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', letterSpacing: '0.4px' }}>
                AIOS Neural Workspace
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(167, 139, 250, 0.2)',
                  border: '1px solid rgba(167, 139, 250, 0.35)',
                  color: '#c4b5fd',
                }}
              >
                ✦ Frieren Copilot v2.0
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
              Connected to OmniRoute Gateway • Port 20128 • Single Supervisor Rule Enforced
            </div>
          </div>
        </div>

        {/* Model Selector & Gateway status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase' }}>
              OmniRoute Model
            </span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {OMNIROUTE_MODELS.map((m) => (
                <option key={m.id} value={m.id} style={{ background: '#181428', color: '#ffffff' }}>
                  {m.label} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/router"
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(167, 139, 250, 0.15)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              color: '#c4b5fd',
              fontSize: '11px',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Gateway View</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* ── Main Workspace Body (2 Columns) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 460px) 1fr',
          gap: '16px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* ── LEFT COLUMN: Frieren Altar, Launcher & Fleet Health ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* Frieren Character Altar Card */}
          <div
            style={{
              background: 'rgba(18, 15, 30, 0.75)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(167, 139, 250, 0.24)',
              borderRadius: '18px',
              padding: '18px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '140px',
                height: '140px',
                background: 'radial-gradient(circle, rgba(167, 139, 250, 0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <FrierenAvatar size={120} mood={mood} glow />

            <div style={{ flex: 1, zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6' }}>Frieren</span>
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600 }}>フリーレン</span>
              </div>
              <div style={{ fontSize: '11px', color: '#c4b5fd', opacity: 0.9, marginTop: '2px' }}>
                Ancient Mage & Chief Systems Copilot
              </div>
              <div
                style={{
                  fontSize: '11.5px',
                  color: '#e2e8f0',
                  marginTop: '8px',
                  lineHeight: '1.45',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                &ldquo;A clean system architecture endures across centuries. Let us ensure the checkpoints remain
                unbroken.&rdquo;
              </div>

              {/* Mood selector buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {(['calm', 'analyzing', 'focused', 'casting'] as FrierenMood[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMood(m)}
                    style={{
                      background: mood === m ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                      border:
                        mood === m
                          ? '1px solid rgba(167, 139, 250, 0.6)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      color: mood === m ? '#ffffff' : '#9ca3af',
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab Selector: Launcher / Fleet / Quests */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(18, 16, 28, 0.6)',
              borderRadius: '12px',
              padding: '4px',
              border: '1px solid rgba(167, 139, 250, 0.15)',
              gap: '4px',
            }}
          >
            {[
              { id: 'launcher', label: '🚀 App Launcher' },
              { id: 'fleet', label: '🛡️ Fleet Ports' },
              { id: 'todos', label: '📜 Quests (Todo)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeTab === tab.id ? 'rgba(167, 139, 250, 0.22)' : 'transparent',
                  color: activeTab === tab.id ? '#ffffff' : '#9ca3af',
                  fontSize: '11.5px',
                  fontWeight: activeTab === tab.id ? 650 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: AIOS Quick App Launcher Grid */}
          {activeTab === 'launcher' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
              }}
            >
              {[
                { title: 'Master Hub', desc: 'Central Command', port: '3000', href: '/', icon: '🛡️' },
                { title: 'AI Gateway', desc: 'OmniRoute Port 20128', port: '20128', href: '/router', icon: '⚡' },
                { title: 'SentinelAI', desc: 'Threat Analysis', port: '5000', href: '/sentinelai', icon: '🤖' },
                { title: 'Hermes Agent', desc: 'Autonomous AI', port: 'Live', href: '/hermes', icon: '✨' },
                { title: 'SentinelTree', desc: 'Lineage Studio', port: '8007', href: '/tree', icon: '🌳' },
                { title: 'SentinelAlong', desc: 'Floorplan CAD', port: '8028', href: '/along', icon: '📐' },
                { title: 'Sentinel CTF', desc: 'Cyber Range', port: '8023', href: '/ctf', icon: '⚔️' },
                { title: 'Database Core', desc: 'fyp2.db WAL', port: 'SQLite', href: '/databases', icon: '🗄️' },
                { title: 'Kali Server', desc: '192.168.68.132', port: 'SSH', href: '/kali', icon: '🐧' },
                { title: 'Antigravity Chat', desc: 'Direct IDE Chat', port: '3000', href: '/chat', icon: '💬' },
              ].map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  style={{
                    background: 'rgba(18, 16, 28, 0.65)',
                    border: '1px solid rgba(167, 139, 250, 0.16)',
                    borderRadius: '12px',
                    padding: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.16)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 600,
                        color: '#a78bfa',
                        background: 'rgba(167, 139, 250, 0.15)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {item.port}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 650, color: '#f3f4f6', marginTop: '2px' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{item.desc}</div>
                </Link>
              ))}
            </div>
          )}

          {/* TAB 2: Fleet Ports Matrix */}
          {activeTab === 'fleet' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'rgba(18, 16, 28, 0.65)',
                border: '1px solid rgba(167, 139, 250, 0.16)',
                borderRadius: '14px',
                padding: '12px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 650,
                  color: '#a78bfa',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px',
                }}
              >
                ✦ Sentinel Fleet Port Registry (Single Supervisor Rule)
              </div>
              {FLEET_SERVICES.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6' }}>{s.name}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      {s.desc} • Supervisor: <strong style={{ color: '#c4b5fd' }}>{s.supervisor}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(167, 139, 250, 0.15)',
                        color: '#c4b5fd',
                      }}
                    >
                      :{s.port}
                    </span>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 6px #10b981',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: Interactive Quest / Todo List */}
          {activeTab === 'todos' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: 'rgba(18, 16, 28, 0.65)',
                border: '1px solid rgba(167, 139, 250, 0.16)',
                borderRadius: '14px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: '#f3f4f6' }}>
                  Frieren&apos;s Mission & Quest Log
                </span>
                <span style={{ fontSize: '10px', color: '#a78bfa' }}>
                  {todos.filter((t) => t.done).length}/{todos.length} Done
                </span>
              </div>

              {/* Add Todo Input */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                  placeholder="Record a mission or task..."
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(167, 139, 250, 0.2)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    color: '#ffffff',
                    fontSize: '11.5px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={addTodo}
                  style={{
                    background: 'rgba(167, 139, 250, 0.25)',
                    border: '1px solid rgba(167, 139, 250, 0.4)',
                    borderRadius: '8px',
                    padding: '0 12px',
                    color: '#c4b5fd',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>

              {/* Todo Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                {todos.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTodo(t.id)}
                      style={{ cursor: 'pointer', accentColor: '#a78bfa' }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        color: t.done ? '#6b7280' : '#e2e8f0',
                        textDecoration: t.done ? 'line-through' : 'none',
                      }}
                    >
                      {t.text}
                    </span>
                    <button
                      onClick={() => deleteTodo(t.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Full Frieren Neural Copilot Chat ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(18, 15, 30, 0.75)',
            backdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(167, 139, 250, 0.24)',
            borderRadius: '18px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.65)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Chat Header */}
          <div
            style={{
              padding: '12px 18px',
              background: 'rgba(23, 19, 38, 0.85)',
              borderBottom: '1px solid rgba(167, 139, 250, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>💬</span>
              <span style={{ fontSize: '13px', fontWeight: 650, color: '#f3f4f6' }}>
                Frieren Technical Dialogue
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                }}
              >
                Online
              </span>
            </div>

            <button
              onClick={() =>
                setMessages([
                  {
                    id: `m-reset-${Date.now()}`,
                    role: 'assistant',
                    content: 'Memory cleared. My ancient grimoires are open for your next inquiry, Jack.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ])
              }
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                color: '#9ca3af',
                cursor: 'pointer',
              }}
            >
              Clear Log
            </button>
          </div>

          {/* Messages Feed */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10.5px',
                    color: m.role === 'user' ? '#c4b5fd' : '#a78bfa',
                    fontWeight: 600,
                    padding: '0 4px',
                  }}
                >
                  <span>{m.role === 'user' ? '◆ Jack' : '✦ Frieren Copilot'}</span>
                  {m.model && <span style={{ opacity: 0.6, fontWeight: 400 }}>• {m.model}</span>}
                </div>

                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background:
                      m.role === 'user'
                        ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(99, 102, 241, 0.8))'
                        : 'rgba(255, 255, 255, 0.05)',
                    border:
                      m.role === 'user'
                        ? '1px solid rgba(167, 139, 250, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f9fafb',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>

                <div
                  style={{
                    fontSize: '9.5px',
                    color: '#6b7280',
                    textAlign: m.role === 'user' ? 'right' : 'left',
                    padding: '0 6px',
                  }}
                >
                  {m.timestamp}
                </div>
              </div>
            ))}

            {isLoading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(167, 139, 250, 0.25)',
                  color: '#c4b5fd',
                  fontSize: '12px',
                }}
              >
                <span>✦ Consulting OmniRoute gateway at router.sentinelai.studio...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(18, 15, 30, 0.5)',
            }}
          >
            {[
              { label: '🛡️ Audit Fleet Status', q: 'Audit Sentinel Fleet Status' },
              { label: '⚡ Test OmniRoute Gateway', q: 'Test OmniRoute gateway connection' },
              { label: '🗄️ Database WAL Check', q: 'Database status' },
              { label: '📜 Computational Spells', q: 'Frieren spells' },
              { label: '🐧 Kali Server Health', q: 'Status of Kali Linux and server ports' },
            ].map((chip, i) => (
              <button
                key={i}
                onClick={() => void handleSendMessage(chip.q)}
                disabled={isLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(167, 139, 250, 0.22)',
                  borderRadius: '14px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: '#e0d8f0',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div
            style={{
              padding: '14px 18px',
              background: 'rgba(22, 18, 36, 0.9)',
              borderTop: '1px solid rgba(167, 139, 250, 0.18)',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-end',
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Ask Frieren about Sentinel Fleet architecture, WAL database rules, or coding..."
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(167, 139, 250, 0.25)',
                borderRadius: '12px',
                padding: '10px 14px',
                color: '#ffffff',
                fontSize: '13px',
                lineHeight: '1.4',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />

            <button
              onClick={() => void handleSendMessage()}
              disabled={isLoading || !inputMsg.trim()}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                border: 'none',
                borderRadius: '12px',
                padding: '0 20px',
                height: '44px',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 650,
                cursor: isLoading || !inputMsg.trim() ? 'default' : 'pointer',
                opacity: isLoading || !inputMsg.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
              }}
            >
              <span>Cast</span>
              <span>✦</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
