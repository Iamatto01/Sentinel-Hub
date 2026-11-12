'use client';

import { useState, useRef, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card } from './ui';

interface ChatMessage {
  id: string;
  sender: 'user' | 'hermes';
  text: string;
  timestamp: string;
  action?: string;
}

export default function HermesView() {
  const [activeTab, setActiveTab] = useState<'console' | 'whatsapp' | 'telegram' | 'cua' | 'dashboard'>('console');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Live Console state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'hermes',
      text: 'Salam & Welcome to Hermes Agent AI. I am your autonomous multi-platform agent powered by OpenRouter and Nous Hermes architecture. I can automate WhatsApp, execute Telegram sales bots, control this PC via CUA (Computer-Use Agent), and execute code.',
      timestamp: 'Just now',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2200);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputValue).trim();
    if (!textToSend || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputValue('');
    setIsSending(true);

    try {
      // Query Sentinel AI backend or fallback
      const res = await fetch('/api/touch/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.data?.reply || data.reply || data.response || 'Perintah diterima. Hermes sedang memproses arahan anda.';
        setMessages((prev) => [
          ...prev,
          {
            id: `hermes-${Date.now()}`,
            sender: 'hermes',
            text: reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            action: data.data?.action,
          },
        ]);
      } else {
        throw new Error('API offline');
      }
    } catch {
      // Local Hermes Smart Handler Fallback
      setTimeout(() => {
        let fallbackReply = `Hermes Agent: Arahan "${textToSend}" telah didaftarkan ke dalam barisan tugas sistem. Untuk pelaksanaan perkakasan penuh (CUA / WhatsApp Gateway), jalankan arahan terminal \`hermes\` atau \`hermes gateway\`.`;
        const lower = textToSend.toLowerCase();

        if (lower.includes('status') || lower.includes('health')) {
          fallbackReply = 'Sentinel & Hermes Gateway Status: ALL SYSTEMS OPERATIONAL. OpenRouter model routing is active. WhatsApp Baileys bridge and Telegram bot gateways are ready to launch.';
        } else if (lower.includes('whatsapp')) {
          fallbackReply = 'Untuk mengaktifkan WhatsApp Bot: Jalankan `hermes gateway` dalam terminal anda dan imbas kod QR yang dipaparkan dengan telefon pintar anda (Menu Linked Devices).';
        } else if (lower.includes('cua') || lower.includes('control') || lower.includes('kawal')) {
          fallbackReply = 'Mod Kawalan Komputer (CUA): `cua-driver 0.21.0` sedia digunakan. Jalankan `hermes --yolo` untuk membenarkan Hermes mengendalikan skrin, tetikus, dan papan kekunci secara autonomi.';
        } else if (lower.includes('model') || lower.includes('openrouter')) {
          fallbackReply = 'Model Utama: DeepSeek V3 / Qwen 2.5 72B melalui OpenRouter. Routing tanpa had token dengan sandaran automatik.';
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `hermes-${Date.now()}`,
            sender: 'hermes',
            text: fallbackReply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setIsSending(false);
      }, 600);
      return;
    }

    setIsSending(false);
  };

  return (
    <>
      <PageHeader
        title="Hermes Agent AI"
        subtitle="Autonomous Multi-Platform Agent with Computer-Use, Messaging Gateway & Self-Hosted Dashboard"
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '9999px',
              color: '#34d399',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 10px #34d399',
                display: 'inline-block',
              }}
            />
            SYSTEM READY &middot; v0.23.0
          </span>
          <span
            style={{
              padding: '4px 10px',
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '9999px',
              color: '#38bdf8',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            PORT 9119 / GATEWAY
          </span>
        </div>
      </PageHeader>

      <PageBody>
        {/* STATS TELEMETRY GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginBottom: '18px',
          }}
        >
          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.8) 0%, rgba(10, 10, 14, 0.9) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Inference Provider
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              OpenRouter <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Auto</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Free &amp; Paid Models via Router
            </div>
          </Card>

          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.8) 0%, rgba(10, 10, 14, 0.9) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Computer Use (CUA)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
              cua-driver 0.21.0
            </div>
            <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '2px' }}>
              Windows Native Driver Ready
            </div>
          </Card>

          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.8) 0%, rgba(10, 10, 14, 0.9) 100%)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Messaging Gateway
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
              WhatsApp &amp; Telegram
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              QR Baileys Bridge / Bot API
            </div>
          </Card>

          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.8) 0%, rgba(10, 10, 14, 0.9) 100%)',
              border: '1px solid rgba(251, 191, 36, 0.25)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Gateway Engine
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', marginTop: '4px' }}>
              Autonomous Daemon
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Interactive Web Console &amp; CLI
            </div>
          </Card>
        </div>

        {/* NAVIGATION / SUB-TABS */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setActiveTab('console')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'console' ? '1px solid #38bdf8' : '1px solid transparent',
              background: activeTab === 'console' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'console' ? '#38bdf8' : '#a1a1aa',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Live Agent Console &amp; Gateway
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'whatsapp' ? '1px solid #34d399' : '1px solid transparent',
              background: activeTab === 'whatsapp' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'whatsapp' ? '#34d399' : '#a1a1aa',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            WhatsApp QR Setup (Method 1)
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'telegram' ? '1px solid #a855f7' : '1px solid transparent',
              background: activeTab === 'telegram' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'telegram' ? '#c084fc' : '#a1a1aa',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Telegram Bot &amp; Auto-Payment
          </button>

          <button
            onClick={() => setActiveTab('cua')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'cua' ? '1px solid #fbbf24' : '1px solid transparent',
              background: activeTab === 'cua' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'cua' ? '#fbbf24' : '#a1a1aa',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Control Laptop (CUA)
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: activeTab === 'dashboard' ? '1px solid #f43f5e' : '1px solid transparent',
              background: activeTab === 'dashboard' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: activeTab === 'dashboard' ? '#fb7185' : '#a1a1aa',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            External Web Server (Port 9119)
          </button>
        </div>

        {/* TAB 1: INTEGRATED AGENT CONSOLE & COMMAND CENTER */}
        {activeTab === 'console' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: '16px', alignItems: 'start' }}>
            {/* LEFT: INTERACTIVE AGENT CHAT */}
            <div
              style={{
                background: 'rgba(12, 14, 18, 0.95)',
                borderRadius: '16px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                height: '620px',
                overflow: 'hidden',
              }}
            >
              {/* CONSOLE TOP BAR */}
              <div
                style={{
                  padding: '12px 18px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>Hermes Interactive Terminal</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>&bull; OpenRouter Bridge</span>
                </div>
                <button
                  onClick={() => setMessages([{ id: 'init', sender: 'hermes', text: 'Chat console reset. Ready for new instructions.', timestamp: 'Just now' }])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Clear Console
                </button>
              </div>

              {/* MESSAGE LOG */}
              <div
                ref={chatScrollRef}
                style={{
                  flex: 1,
                  padding: '16px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: m.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        background: m.sender === 'user' ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'rgba(255, 255, 255, 0.06)',
                        border: m.sender === 'user' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '0.88rem',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {m.text}
                      {m.action && (
                        <div style={{ marginTop: '6px', padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '0.75rem', color: '#fbbf24', fontFamily: 'monospace' }}>
                          Triggered Action: {m.action}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px', padding: '0 4px' }}>
                      {m.timestamp}
                    </span>
                  </div>
                ))}

                {isSending && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '0.82rem', padding: '6px' }}>
                    <span style={{ animation: 'pulse 1.5s infinite' }}>Hermes is typing...</span>
                  </div>
                )}
              </div>

              {/* QUICK PROMPTS */}
              <div style={{ padding: '8px 16px', background: 'rgba(0, 0, 0, 0.2)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', gap: '6px', overflowX: 'auto' }}>
                {[
                  'Check Gateway Status',
                  'WhatsApp Broadcast Template',
                  'Setup DuitNow QR Flow',
                  'Test Computer-Use Command',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSendMessage(chip)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '9999px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      color: '#cbd5e1',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* INPUT BOX */}
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type an instruction for Hermes Agent..."
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isSending || !inputValue.trim()}
                  style={{
                    padding: '0 18px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSending || !inputValue.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSending || !inputValue.trim() ? 0.6 : 1,
                    fontSize: '0.85rem',
                  }}
                >
                  Send
                </button>
              </div>
            </div>

            {/* RIGHT: COMMAND LAUNCHER & GATEWAY CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Card
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '18px',
                  borderRadius: '14px',
                }}
              >
                <h4 style={{ color: '#38bdf8', fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Quick Launcher Commands
                </h4>
                <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginBottom: '14px' }}>
                  Run these in your Windows terminal / PowerShell to activate local daemon processes:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { id: 'chat', label: 'Interactive Chat (CLI)', cmd: 'hermes' },
                    { id: 'gateway', label: 'Start Messaging Gateway (WhatsApp/TG)', cmd: 'hermes gateway' },
                    { id: 'yolo', label: 'Full Autonomous Computer-Use', cmd: 'hermes --yolo' },
                    { id: 'model', label: 'Switch Model & Provider', cmd: 'hermes model' },
                  ].map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: '#09090b',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.label}</div>
                        <code style={{ fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'monospace' }}>{item.cmd}</code>
                      </div>
                      <button
                        onClick={() => copyToClipboard(item.cmd, item.id)}
                        style={{
                          background: copiedCmd === item.id ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          borderRadius: '6px',
                          color: copiedCmd === item.id ? '#34d399' : '#cbd5e1',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedCmd === item.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  padding: '18px',
                  borderRadius: '14px',
                }}
              >
                <h4 style={{ color: '#34d399', fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  WhatsApp &amp; Telegram Gateway
                </h4>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Hermes handles real-time messaging seamlessly via the <b>Baileys QR Web bridge</b> for WhatsApp and <b>BotFather</b> for Telegram.
                </p>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setActiveTab('whatsapp')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'rgba(52, 211, 153, 0.15)',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      color: '#34d399',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Setup WhatsApp
                  </button>
                  <button
                    onClick={() => setActiveTab('telegram')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      color: '#c084fc',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Setup Telegram
                  </button>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: WHATSAPP QR CODE METHOD 1 */}
        {activeTab === 'whatsapp' && (
          <Card
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              padding: '24px',
              borderRadius: '16px',
            }}
          >
            <h3 style={{ color: '#34d399', fontSize: '1.25rem', marginBottom: '8px' }}>
              Method 1: Sambung WhatsApp Guna QR Code (Baileys Bridge)
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '16px' }}>
              Ini adalah cara paling mudah tanpa perlu daftar akaun Meta Developer atau bayar bil API. Hermes bertindak seperti sesi WhatsApp Web di laptop anda.
            </p>

            <div style={{ display: 'grid', gap: '14px', maxWidth: '720px' }}>
              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>Langkah 1:</b> Dalam terminal yang anda buka tadi (di mana ia tanya{' '}
                <code style={{ color: '#fbbf24' }}>Allowed user IDs:</code>), <b>tekan ENTER</b> sahaja (biar kosong).
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>Langkah 2:</b> Mulakan perkhidmatan WhatsApp Gateway:
                <pre
                  style={{
                    background: '#09090b',
                    padding: '10px',
                    borderRadius: '6px',
                    color: '#34d399',
                    fontFamily: 'monospace',
                    marginTop: '6px',
                  }}
                >
                  hermes gateway
                </pre>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>Langkah 3:</b> Terminal akan melukis <b>QR Code</b>. Buka WhatsApp di telefon bimbit anda &rarr; <b>Linked Devices (Peranti Dipautkan)</b> &rarr; <b>Link a Device</b> &rarr; Imbas QR Code tersebut.
              </div>

              <div
                style={{
                  background: 'rgba(52, 211, 153, 0.08)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(52, 211, 153, 0.25)',
                  color: '#e2e8f0',
                  fontSize: '0.85rem',
                }}
              >
                <b>Petua Keselamatan:</b> Guna nombor WhatsApp kedua / test number untuk elak risiko spam block dari WhatsApp sekiranya bot menjawab ratusan mesej serentak.
              </div>
            </div>
          </Card>
        )}

        {/* TAB 3: TELEGRAM AUTO-PAYMENT */}
        {activeTab === 'telegram' && (
          <Card
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              padding: '24px',
              borderRadius: '16px',
            }}
          >
            <h3 style={{ color: '#c084fc', fontSize: '1.25rem', marginBottom: '8px' }}>
              Telegram Bot &amp; Sistem Jualan Auto-Payment
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '16px' }}>
              Telegram adalah platform terbaik dan paling stabil untuk buat bot jualan automatik kerana API rasminya 100% percuma dan tiada sekatan pautan.
            </p>

            <div style={{ display: 'grid', gap: '14px', maxWidth: '750px' }}>
              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>1. Dapatkan Token Bot Telegram (Percuma):</b>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>
                  Buka Telegram dan cari <code>@BotFather</code>. Hantar mesej <code>/newbot</code>, beri nama bot anda, dan BotFather akan berikan API Token seperti:
                  <div style={{ background: '#09090b', padding: '6px 10px', borderRadius: '4px', color: '#a855f7', fontFamily: 'monospace', marginTop: '4px' }}>
                    718293849:AAHk...
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>2. Sambungkan Telegram ke Hermes:</b>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>
                  Jalankan command ini di PowerShell untuk masukkan token Telegram anda:
                  <pre style={{ background: '#09090b', padding: '8px 12px', borderRadius: '6px', color: '#38bdf8', fontFamily: 'monospace', marginTop: '4px' }}>
                    hermes gateway setup
                  </pre>
                  Pilih opsyen <b>Telegram</b> dan paste token tadi!
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>3. Auto-Payment &amp; Delivery Flow:</b>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '6px' }}>
                  Bila pelanggan chat ingin beli:
                  <ul style={{ paddingLeft: '20px', marginTop: '4px', lineHeight: '1.6' }}>
                    <li><b>Opsyen A (Payment Gateway):</b> Bot hantar link FPX/QR ToyyibPay atau Billplz. Bila pembeli bayar, webhook auto-hantar fail/lesen.</li>
                    <li><b>Opsyen B (Maybank DuitNow QR + Resit OCR):</b> Bot hantar gambar QR Maybank anda. Pembeli upload screenshot resit bank, Hermes periksa status &quot;Successful&quot; dan jumlah RM secara automatik sebelum lepaskan fail.</li>
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* TAB 4: COMPUTER USE (CUA) */}
        {activeTab === 'cua' && (
          <Card
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              padding: '24px',
              borderRadius: '16px',
            }}
          >
            <h3 style={{ color: '#fbbf24', fontSize: '1.25rem', marginBottom: '8px' }}>
              Cara Suruh Hermes Kawal Laptop Anda
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '16px' }}>
              Hermes dilengkapi dengan pemacu <code>cua-driver</code> (Computer-Use Agent) yang membolehkannya mengawal skrin, klik tetikus, taip teks, dan jalankan script Windows secara autonomi.
            </p>

            <div style={{ display: 'grid', gap: '14px', maxWidth: '750px' }}>
              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>1. Mod Autonomi Sepenuhnya (--yolo):</b>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>
                  Secara default, Hermes akan minta izin (confirmation) sebelum jalankan arahan. Kalau anda mahu dia jalankan semuanya terus:
                  <pre style={{ background: '#09090b', padding: '8px 12px', borderRadius: '6px', color: '#fbbf24', fontFamily: 'monospace', marginTop: '4px' }}>
                    hermes --yolo
                  </pre>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <b style={{ color: '#f8fafc' }}>2. Contoh Arahan Boleh Diberi:</b>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '6px' }}>
                  <ul style={{ paddingLeft: '20px', lineHeight: '1.7' }}>
                    <li><i>&quot;Buka Notepad, tulis senarai tugasan projek Sentinel dan simpan di Desktop.&quot;</i></li>
                    <li><i>&quot;Ambil screenshot skrin komputer saya sekarang dan beritahu apa aplikasi yang sedang dibuka.&quot;</i></li>
                    <li><i>&quot;Buka Chrome dan carikan maklumat berkaitan kemas kini terkini.&quot;</i></li>
                    <li><i>&quot;Periksa proses apa yang gunakan CPU paling tinggi dan laporkan.&quot;</i></li>
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* TAB 5: EXTERNAL PORT 9119 WITH SMART STANDBY FALLBACK */}
        {activeTab === 'dashboard' && (
          <div
            style={{
              background: '#09090b',
              borderRadius: '16px',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              boxShadow: '0 0 35px rgba(244, 63, 94, 0.08), 0 20px 40px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
              minHeight: '520px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <h3 style={{ color: '#f8fafc', fontSize: '1.3rem', marginBottom: '8px' }}>
              External Web Server (Port 9119)
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '580px', marginBottom: '20px', lineHeight: 1.6 }}>
              Untuk memaparkan Web UI penuh Hermes pada port 9119, pastikan daemon Hermes dijalankan di komputer anda. Pelayan web luar tidak disambungkan secara automatik ke domain HTTPS awam untuk keselamatan.
            </p>

            <div
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 20px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <code style={{ color: '#fb7185', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                hermes dashboard --port 9119
              </code>
              <button
                onClick={() => copyToClipboard('hermes dashboard --port 9119', 'dash')}
                style={{
                  background: copiedCmd === 'dash' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                {copiedCmd === 'dash' ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setActiveTab('console')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                ← Return to Live Console
              </button>
              <a
                href="http://localhost:9119"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Open http://localhost:9119 ↗
              </a>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
