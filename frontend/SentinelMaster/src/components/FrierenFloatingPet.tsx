'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import FrierenAvatar, { type FrierenMood } from './FrierenAvatar';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp?: string;
}

const QUOTES = [
  '✦ OmniRoute Gateway is active on Port 20128. I am monitoring provider latency.',
  '✦ Remember: fyp2.db requires WAL mode. Never checkpoint without verification.',
  '✦ Zoltraak is ready to clear hung zombie sockets if you need, Jack.',
  '✦ A clean architecture is like a centuries-old defensive barrier.',
  '✦ Need fleet diagnostics? Click me or press Alt+F to consult the grimoire.',
];

const PROMPT_CHIPS = [
  { label: '🛡️ Audit Fleet', query: 'Audit Sentinel Fleet Status' },
  { label: '⚡ Test OmniRoute', query: 'Test OmniRoute gateway connection' },
  { label: '📜 Frieren Spells', query: 'Frieren spells' },
  { label: '🗄️ Database WAL', query: 'Database status' },
];

export default function FrierenFloatingPet() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [mood, setMood] = useState<FrierenMood>('calm');
  const [bubbleText, setBubbleText] = useState(QUOTES[0]);
  const [showBubble, setShowBubble] = useState(true);
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hello, Jack. I am Frieren, Chief Technical Copilot for Sentinel Hub. My senses are linked directly to the OmniRoute gateway on port 20128. How may I assist your fleet today?',
      model: 'antigravity/gemini-3.8-flash-high',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore persisted state
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('sentinel_frieren_mode');
      if (savedMode === 'compact') setIsCompact(true);
    } catch {
      // Ignore
    }
  }, []);

  // Periodic wisdom quotes
  useEffect(() => {
    const interval = setInterval(() => {
      setBubbleText((prev) => {
        const nextIdx = (QUOTES.indexOf(prev) + 1) % QUOTES.length;
        return QUOTES[nextIdx];
      });
      setShowBubble(true);
    }, 28000);
    return () => clearInterval(interval);
  }, []);

  // Alt+F keyboard shortcut to toggle Copilot
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const q = (textToSend ?? inputMsg).trim();
      if (!q || isLoading) return;

      setInputMsg('');
      setIsLoading(true);
      setMood('analyzing');

      const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages((prev) => [...prev, { role: 'user', content: q, timestamp: userTime }]);

      try {
        const res = await fetch('/api/frieren/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: q,
            history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const reply = json.data?.reply || 'I heard your request, Jack.';
          const model = json.data?.model || 'OmniRoute';
          const time = json.data?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          setMessages((prev) => [...prev, { role: 'assistant', content: reply, model, timestamp: time }]);
          setMood('calm');
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'A disruption occurred in the OmniRoute mana channel. Please verify port 20128.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          setMood('calm');
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Mana stream interrupted: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setMood('calm');
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [inputMsg, isLoading, messages],
  );

  const toggleCompact = () => {
    setIsCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sentinel_frieren_mode', next ? 'compact' : 'full');
      } catch {
        // Ignore
      }
      return next;
    });
  };

  return (
    <>
      {/* ── Floating Mini-Copilot Flyout Modal ── */}
      {isOpen && (
        <div
          className="frieren-flyout-modal"
          style={{
            position: 'fixed',
            bottom: '185px',
            right: '24px',
            width: '390px',
            height: '520px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 200px)',
            background: 'rgba(15, 14, 23, 0.94)',
            backdropFilter: 'blur(28px) saturate(190%)',
            WebkitBackdropFilter: 'blur(28px) saturate(190%)',
            border: '1px solid rgba(167, 139, 250, 0.28)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75), 0 0 35px rgba(167, 139, 250, 0.15)',
            borderRadius: '18px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 45,
            animation: 'frieren-fade-in 0.25s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(23, 20, 36, 0.85)',
              borderBottom: '1px solid rgba(167, 139, 250, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 650, color: '#f3f4f6', letterSpacing: '0.3px' }}>
                  Frieren AIOS Copilot
                </div>
                <div style={{ fontSize: '10px', color: '#c4b5fd', opacity: 0.9 }}>
                  OmniRoute Gateway • port 20128
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Link
                href="/frieren"
                onClick={() => setIsOpen(false)}
                title="Open full AIOS Workspace"
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(167, 139, 250, 0.15)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  color: '#c4b5fd',
                  fontSize: '11px',
                  textDecoration: 'none',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>Full AIOS</span>
                <span style={{ fontSize: '12px' }}>↗</span>
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  fontSize: '14px',
                  borderRadius: '6px',
                }}
                title="Minimize (Alt+F)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  padding: '10px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background:
                    m.role === 'user'
                      ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.8), rgba(99, 102, 241, 0.75))'
                      : 'rgba(255, 255, 255, 0.06)',
                  border:
                    m.role === 'user'
                      ? '1px solid rgba(167, 139, 250, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f9fafb',
                  fontSize: '12.5px',
                  lineHeight: '1.5',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                {m.role === 'assistant' && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#a78bfa',
                      fontWeight: 600,
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>✦ Frieren</span>
                    {m.model && (
                      <span style={{ opacity: 0.65, fontWeight: 400 }}>
                        • {m.model.split('/').pop()}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                {m.timestamp && (
                  <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px', textAlign: 'right' }}>
                    {m.timestamp}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(167, 139, 250, 0.2)',
                  color: '#c4b5fd',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>✦ Consulting OmniRoute grimoire...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div
            style={{
              padding: '6px 12px',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(18, 16, 28, 0.6)',
            }}
          >
            {PROMPT_CHIPS.map((chip, i) => (
              <button
                key={i}
                onClick={() => void handleSend(chip.query)}
                disabled={isLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(167, 139, 250, 0.2)',
                  borderRadius: '12px',
                  padding: '3px 9px',
                  fontSize: '10.5px',
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

          {/* Input Bar */}
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(20, 18, 32, 0.9)',
              borderTop: '1px solid rgba(167, 139, 250, 0.16)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ask Frieren about Sentinel Fleet or code..."
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(167, 139, 250, 0.25)',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={isLoading || !inputMsg.trim()}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                border: 'none',
                borderRadius: '10px',
                padding: '0 14px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isLoading ? 'default' : 'pointer',
                opacity: isLoading || !inputMsg.trim() ? 0.5 : 1,
              }}
            >
              ✦
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom-Right Floating Companion ── */}
      <div
        className="frieren-floating-container"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '24px',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          userSelect: 'none',
        }}
      >
        {/* Thought / Wisdom Speech Bubble */}
        {!isOpen && showBubble && !isCompact && (
          <div
            style={{
              position: 'relative',
              maxWidth: '240px',
              background: 'rgba(20, 17, 34, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              borderRadius: '14px',
              padding: '8px 12px',
              marginBottom: '10px',
              color: '#ede9fe',
              fontSize: '11px',
              lineHeight: '1.4',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              animation: 'frieren-float-bubble 4s ease-in-out infinite',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.5px' }}>
                ✦ FRIEREN COPILOT
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBubble(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '11px',
                  lineHeight: '1',
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            </div>
            <div>{bubbleText}</div>
            <div
              style={{
                position: 'absolute',
                bottom: '-6px',
                right: '45px',
                width: '10px',
                height: '10px',
                background: 'rgba(20, 17, 34, 0.92)',
                borderRight: '1px solid rgba(167, 139, 250, 0.3)',
                borderBottom: '1px solid rgba(167, 139, 250, 0.3)',
                transform: 'rotate(45deg)',
              }}
            />
          </div>
        )}

        {/* Chibi Pet Card or Compact Orb */}
        {isCompact ? (
          /* Compact Orb Mode */
          <div
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(22, 17, 38, 0.88)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(167, 139, 250, 0.4)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(167, 139, 250, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            title="Click to consult Frieren Copilot (Alt+F)"
          >
            <FrierenAvatar size={44} mood={mood} glow={false} />
            <div
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#10b981',
                border: '2px solid #0f0e17',
              }}
            />
          </div>
        ) : (
          /* Full Chibi Desktop Pet Card */
          <div
            style={{
              width: '145px',
              height: '165px',
              background: 'rgba(20, 16, 36, 0.78)',
              backdropFilter: 'blur(28px) saturate(190%)',
              WebkitBackdropFilter: 'blur(28px) saturate(190%)',
              border: '1px solid rgba(167, 139, 250, 0.32)',
              borderTop: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '22px',
              boxShadow:
                '0 16px 36px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 0 24px rgba(167, 139, 250, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={() => setIsOpen((prev) => !prev)}
            title="Frieren Technical Copilot • Click to chat (Alt+F)"
          >
            {/* Top Control Buttons */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                display: 'flex',
                gap: '4px',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={toggleCompact}
                title="Switch to compact orb"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  color: '#cbd5e1',
                  fontSize: '9px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                _
              </button>
            </div>

            {/* Animated Sprite */}
            <FrierenAvatar size={110} mood={mood} glow />

            {/* Status Pill Badge */}
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                color: '#e0e7ff',
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '8px',
                background: 'rgba(167, 139, 250, 0.2)',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                marginTop: '-4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
              <span>Frieren Copilot</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
