'use client';

import { useState } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

interface ThoughtStep {
  step: string;
  description: string;
  timestamp: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thoughts?: ThoughtStep[];
}

export default function GrokBotView() {
  const [mode, setMode] = useState<'reasoning' | 'fast' | 'fun'>('reasoning');
  const [inputPrompt, setInputPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Grok Autonomous Agent initialized. Powered by open-source high-speed reasoning pipelines. Ready to execute complex multi-step workflows, code refactors, or deep systems analysis.',
      thoughts: [
        { step: 'init', description: 'Loaded system weights & tool definitions', timestamp: '0.0s' },
        { step: 'ready', description: 'Workspace environment ready', timestamp: '0.1s' },
      ],
    },
  ]);

  const runGrokAgent = async () => {
    if (!inputPrompt.trim() || isRunning) return;
    const userText = inputPrompt;
    setInputPrompt('');
    setIsRunning(true);

    const newMsgs: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMsgs);

    try {
      const res = await fetch('/api/grok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText, mode }),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        setMessages([
          ...newMsgs,
          {
            role: 'assistant',
            content: data.reply,
            thoughts: data.thoughts,
          },
        ]);
      } else {
        setMessages([
          ...newMsgs,
          {
            role: 'assistant',
            content: 'Agent error: Failed to complete reasoning execution.',
          },
        ]);
      }
    } catch {
      setMessages([
        ...newMsgs,
        {
          role: 'assistant',
          content: 'Agent offline: Local reasoning fallback activated.',
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Grok Bot Hub"
        subtitle="Open-Source Grok Autonomous AI Agent · Deep Reasoning & Multi-Step Execution Core"
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className={`btn sm ${mode === 'reasoning' ? 'primary' : 'ghost'}`}
            onClick={() => setMode('reasoning')}
          >
            🧠 Deep Reasoning (R1 / Grok-3)
          </button>
          <button
            type="button"
            className={`btn sm ${mode === 'fast' ? 'primary' : 'ghost'}`}
            onClick={() => setMode('fast')}
          >
            ⚡ Fast Mode (Grok-2)
          </button>
          <button
            type="button"
            className={`btn sm ${mode === 'fun' ? 'primary' : 'ghost'}`}
            onClick={() => setMode('fun')}
          >
            🎯 Fun Mode (Sharp Wit)
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {/* Telemetry Stats */}
        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Stat label="Active Reasoning Mode" value={mode.toUpperCase()} foot="Agent decision engine" />
          <Stat label="Inference Engine" value="Groq / Open-Source" foot="Sub-second latency pipeline" />
          <Stat label="Agent Tools" value="Active (Web / Shell / Code)" foot="Deterministic execution sandbox" />
        </div>

        {/* Chat / Agent Conversation Stream */}
        <Card style={{ minHeight: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: msg.role === 'user' ? 'rgba(79, 140, 255, 0.12)' : 'var(--panel-2)',
                  border: msg.role === 'user' ? '1px solid rgba(79, 140, 255, 0.3)' : '1px solid var(--line)',
                  maxWidth: msg.role === 'user' ? '80%' : '100%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'stretch',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{msg.role === 'user' ? '👤' : '🤖'}</span>
                  <strong style={{ fontSize: 12, color: msg.role === 'user' ? 'var(--accent)' : 'var(--text)' }}>
                    {msg.role === 'user' ? 'YOU' : `GROK BOT (${mode.toUpperCase()})`}
                  </strong>
                </div>

                {/* Thought Chain Traces */}
                {msg.thoughts && msg.thoughts.length > 0 ? (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: '8px 12px',
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: 6,
                      borderLeft: '2px solid var(--accent)',
                      fontSize: 11,
                      fontFamily: 'var(--mono)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
                      💭 Thought Chain Trace:
                    </div>
                    {msg.thoughts.map((t, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, margin: '2px 0' }}>
                        <span style={{ color: 'var(--text-faint)' }}>[{t.timestamp}]</span>
                        <span>{t.description}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    fontFamily: msg.role === 'assistant' ? 'var(--sans)' : 'inherit',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isRunning ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12,
                  color: 'var(--accent)',
                }}
              >
                <span className="spinner" />
                <span>Grok is reasoning through deep neural thought chains…</span>
              </div>
            ) : null}
          </div>

          {/* Input Bar */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runGrokAgent();
              }}
              placeholder="Ask Grok to analyze code, research a vulnerability, or run an autonomous multi-step task..."
              className="input"
              style={{ flex: 1 }}
              disabled={isRunning}
            />
            <button
              type="button"
              className="btn primary"
              disabled={isRunning || !inputPrompt.trim()}
              onClick={runGrokAgent}
            >
              {isRunning ? 'Reasoning…' : 'Dispatch Agent ↵'}
            </button>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
