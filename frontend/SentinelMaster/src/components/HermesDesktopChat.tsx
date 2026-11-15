'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  type ChatMessage,
  getStoredHermesMessages,
  saveStoredHermesMessages,
  HERMES_CHAT_EVENT,
  INITIAL_HERMES_MESSAGES,
} from '@/lib/hermes-chat';

export default function HermesDesktopChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState('antigravity/gemini-3.8-flash-high');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initialize messages from shared storage
  useEffect(() => {
    setMessages(getStoredHermesMessages());

    const handleSync = (e: Event) => {
      const customEvt = e as CustomEvent<ChatMessage[]>;
      if (customEvt.detail && Array.isArray(customEvt.detail)) {
        setMessages(customEvt.detail);
      } else {
        setMessages(getStoredHermesMessages());
      }
    };

    window.addEventListener(HERMES_CHAT_EVENT, handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener(HERMES_CHAT_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Auto-scroll to bottom on message updates
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = (textOverride || inputValue).trim();
    if (!textToSend || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    saveStoredHermesMessages(nextMessages);

    if (!textOverride) setInputValue('');
    setIsSending(true);

    try {
      const res = await fetch('/api/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          model: selectedModel,
          persona: 'hermes',
          history: nextMessages.slice(-4).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        const reply = data?.reply || 'Perintah diproses oleh Hermes Agent.';

        const botMsg: ChatMessage = {
          id: `hermes-${Date.now()}`,
          sender: 'hermes',
          text: reply,
          model: data?.model || selectedModel,
          persona: data?.persona || 'hermes',
          timestamp: data?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: data?.action?.command,
        };

        const finalMessages = [...nextMessages, botMsg];
        setMessages(finalMessages);
        saveStoredHermesMessages(finalMessages);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `hermes-${Date.now()}`,
        sender: 'hermes',
        text: `Hermes Agent: Arahan "${textToSend}" telah diproses. Anda boleh membuka konsol penuh untuk mengawal WhatsApp, Telegram dan CUA.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const finalMessages = [...nextMessages, fallbackMsg];
      setMessages(finalMessages);
      saveStoredHermesMessages(finalMessages);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearChat = () => {
    setMessages(INITIAL_HERMES_MESSAGES);
    saveStoredHermesMessages(INITIAL_HERMES_MESSAGES);
  };

  return (
    <div className="desktop-hermes-chat-card">
      {/* Header */}
      <div className="hermes-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="hermes-avatar-badge">
            ⚡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                Hermes Agent AI
              </span>
              <span className="hermes-live-pill">
                <span className="dot" />
                ONLINE
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              OmniRoute Intelligence · Port 20128
            </div>
          </div>
        </div>

        <Link
          href="/hermes"
          className="hermes-expand-btn"
          title="Open Full Hermes Command Console"
        >
          <span>Full Console</span>
          <span>↗</span>
        </Link>
      </div>

      {/* Quick Action Chips */}
      <div className="hermes-quick-chips">
        <button
          type="button"
          onClick={() => handleSendMessage('Audit fleet')}
          className="hermes-chip"
        >
          ✦ Audit Fleet
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage('Database status')}
          className="hermes-chip"
        >
          📊 DB Status
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage('Status OmniRoute')}
          className="hermes-chip"
        >
          🌐 OmniRoute
        </button>
        <button
          type="button"
          onClick={handleClearChat}
          className="hermes-chip clear"
          title="Clear Conversation History"
        >
          ✕ Clear
        </button>
      </div>

      {/* Messages Stream */}
      <div className="hermes-messages-stream" ref={chatScrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`hermes-msg-row ${msg.sender === 'user' ? 'user' : 'bot'}`}
          >
            {msg.sender === 'hermes' && (
              <div className="hermes-msg-avatar">⚡</div>
            )}
            <div className="hermes-msg-bubble">
              <div className="hermes-msg-content">{msg.text}</div>
              <div className="hermes-msg-meta">
                <span>{msg.timestamp}</span>
                {msg.model && <span className="hermes-msg-model">{msg.model.split('/').pop()}</span>}
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="hermes-msg-row bot">
            <div className="hermes-msg-avatar">⚡</div>
            <div className="hermes-msg-bubble thinking">
              <div className="hermes-typing-dots">
                <span />
                <span />
                <span />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                Hermes sedang memproses arahan via OmniRoute...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input Field */}
      <form
        className="hermes-input-box"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tanya Hermes tentang server, bot, atau telemetri..."
          disabled={isSending}
          className="hermes-chat-input"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isSending}
          className="hermes-chat-send-btn"
          aria-label="Send message"
        >
          {isSending ? (
            <span className="spinner" />
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
