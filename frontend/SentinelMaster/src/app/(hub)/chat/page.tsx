'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  timestamp?: string;
}

interface Conversation {
  id: string;
  title: string;
  time?: string;
  hasUnread?: boolean;
  messages: Message[];
}

interface Project {
  id: string;
  name: string;
  conversations: Conversation[];
}

interface StoreData {
  activeProject: string;
  activeChatId: string | null;
  projects: Project[];
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  note: string;
  icon: 'kimi' | 'claude' | 'gemini' | 'deepseek' | 'grok' | 'openai' | 'glm' | 'sentinel';
}

function ModelLogo({ type, size = 20 }: { type: string; size?: number }) {
  const s = `${size}px`;
  switch (type) {
    case 'kimi':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#0b1b36" stroke="#0ea5e9" strokeWidth="1.5" />
          <path d="M7 6.5V17.5M17 6.5L11.5 12L17 17.5M11.5 12H7" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'claude':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#2d150b" stroke="#f97316" strokeWidth="1.5" />
          <path d="M12 4.5V19.5M4.5 12H19.5M6.7 6.7L17.3 17.3M17.3 6.7L6.7 17.3" stroke="#fb923c" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'gemini':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#151939" stroke="#818cf8" strokeWidth="1.5" />
          <path d="M12 4C12 8.418 8.418 12 4 12C8.418 12 12 15.582 12 20C12 15.582 15.582 12 20 12C15.582 12 12 8.418 12 4Z" fill="url(#gemini-grad-logo)" />
          <defs>
            <linearGradient id="gemini-grad-logo" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'deepseek':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#081a36" stroke="#3b82f6" strokeWidth="1.5" />
          <path d="M6 14.5C7.5 10.5 11 8.5 15.5 9C17 9.2 18 10 18 11.5C18 13.5 15 15 12 15C9.5 15 7.5 16 6 17.5V14.5Z" fill="#3b82f6" />
          <circle cx="14.5" cy="11.5" r="1" fill="#ffffff" />
        </svg>
      );
    case 'grok':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#18181b" stroke="#71717a" strokeWidth="1.5" />
          <path d="M7 6.5L17 17.5M17 6.5L7 17.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'openai':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#042f24" stroke="#10b981" strokeWidth="1.5" />
          <path d="M12 7V17M7 9.5L17 14.5M7 14.5L17 9.5" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'glm':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#251048" stroke="#a855f7" strokeWidth="1.5" />
          <path d="M12 6L17.5 9.5V14.5L12 18L6.5 14.5V9.5L12 6Z" stroke="#c084fc" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" fill="#f3e8ff" />
        </svg>
      );
    case 'sentinel':
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: '50%' }}>
          <circle cx="12" cy="12" r="11" fill="#042f2e" stroke="#14b8a6" strokeWidth="1.5" />
          <path d="M13 6L8 13H13L11 18L16 11H11L13 6Z" fill="#2dd4bf" stroke="#14b8a6" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
      );
  }
}

const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'kimi-web/k3',
    name: 'kimi-web/k3',
    provider: 'Moonshot AI',
    note: 'Moonshot Kimi K3 • Long Context & Fast Coding',
    icon: 'kimi',
  },
  {
    id: 'antigravity/claude-sonnet-4-6',
    name: 'claude-sonnet-4-6',
    provider: 'Anthropic',
    note: 'Claude 3.5 / 4.6 Sonnet • Frontier Logic & Code',
    icon: 'claude',
  },
  {
    id: 'antigravity/gemini-3-flash',
    name: 'gemini-3-flash',
    provider: 'Google DeepMind',
    note: 'Gemini 3 Flash • Ultra-Fast Intelligence',
    icon: 'gemini',
  },
  {
    id: 'antigravity/claude-opus-4-6-thinking',
    name: 'claude-opus-4-6-thinking',
    provider: 'Anthropic',
    note: 'Claude Opus 4.6 • Deep Extended Reasoning',
    icon: 'claude',
  },
  {
    id: 'deepseek-web/expert',
    name: 'deepseek-web/expert',
    provider: 'DeepSeek AI',
    note: 'DeepSeek R1 / V3 • Math & Chain-of-Thought',
    icon: 'deepseek',
  },
  {
    id: 'grok-cli/grok-4.7',
    name: 'grok-cli/grok-4.7',
    provider: 'xAI',
    note: 'xAI Grok 4.7 • Frontier Intelligence',
    icon: 'grok',
  },
  {
    id: 'antigravity/gemini-3.5-flash-lite',
    name: 'gemini-3.5-flash-lite',
    provider: 'Google DeepMind',
    note: 'Gemini 3.5 Flash Lite • Low Latency Streaming',
    icon: 'gemini',
  },
  {
    id: 'antigravity/gpt-oss-120b-medium',
    name: 'gpt-oss-120b-medium',
    provider: 'OpenAI / OSS',
    note: 'GPT-OSS 120B • High-Capacity General LLM',
    icon: 'openai',
  },
  {
    id: 'zai-web/glm-5.2',
    name: 'zai-web/glm-5.2',
    provider: 'Zhipu AI',
    note: 'GLM 5.2 • Bilingual Agentic Model',
    icon: 'glm',
  },
  {
    id: 'auto/best-fast',
    name: 'auto/best-fast',
    provider: 'Sentinel OmniRoute',
    note: 'Auto-Cascade • Lowest Latency Winner',
    icon: 'sentinel',
  },
];

const DEFAULT_STORE: StoreData = {
  activeProject: 'INI KALI LA',
  activeChatId: null,
  projects: [
    {
      id: 'frieren-desktop',
      name: 'frieren-desktop',
      conversations: [
        { id: 'fd_1', title: 'Optimizing RAM And Boot...', time: '6d', hasUnread: false, messages: [] },
        { id: 'fd_2', title: 'Reset Laptop Default Setti...', time: '', hasUnread: true, messages: [] },
        { id: 'fd_3', title: 'Best Fast Uncensored M...', time: '10d', hasUnread: false, messages: [] },
        { id: 'fd_4', title: 'Missing Windows Feature...', time: '10d', hasUnread: false, messages: [] },
      ],
    },
    {
      id: 'INI KALI LA',
      name: 'INI KALI LA',
      conversations: [
        { id: 'ikl_1', title: 'Update Sentinel API Conta...', time: '4d', hasUnread: false, messages: [] },
        { id: 'ikl_2', title: 'Sentinel Router Hermes AI...', time: '8d', hasUnread: false, messages: [] },
        { id: 'ikl_3', title: 'AI Model Update Issue', time: '9d', hasUnread: false, messages: [] },
        { id: 'ikl_4', title: 'Cloudflare Misconfigurat...', time: '21d', hasUnread: false, messages: [] },
        { id: 'ikl_5', title: 'Cloudflare Error 1033 Tro...', time: '21d', hasUnread: false, messages: [] },
        { id: 'ikl_6', title: 'Family Tree Website Error', time: '', hasUnread: true, messages: [] },
      ],
    },
    {
      id: 'FYP2PROJECT',
      name: 'FYP2PROJECT',
      conversations: [
        { id: 'fyp_1', title: 'Laya Model FYP Ideas', time: '1mo', hasUnread: false, messages: [] },
        { id: 'fyp_2', title: 'CVSS 4.0 Calculator Fix', time: '2mo', hasUnread: false, messages: [] },
      ],
    },
  ],
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Helper for parsing inline markdown formatting: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  const regex = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} style={{ color: '#ffffff', fontWeight: 650 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '1.5px 5.5px',
            borderRadius: '4px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            color: '#38bdf8',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={i} style={{ fontStyle: 'italic', color: '#cbd5e1' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Lightweight React-safe Markdown renderer with code block syntax highlighting, subtopics & inline markdown */
function FormattedMessage({ content }: { content: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const parts = useMemo(() => {
    // Split by code blocks ```lang ... ```
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const result: Array<{ type: 'text' | 'code'; lang?: string; code?: string; text?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', text: content.slice(lastIndex, match.index) });
      }
      result.push({ type: 'code', lang: match[1] || 'code', code: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      result.push({ type: 'text', text: content.slice(lastIndex) });
    }
    return result;
  }, [content]);

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="formatted-prose" style={{ lineHeight: 1.6, fontSize: '13.5px', color: '#e4e4e7' }}>
      {parts.map((part, idx) => {
        if (part.type === 'code' && part.code !== undefined) {
          return (
            <div
              key={idx}
              style={{
                margin: '12px 0',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#0d0e12',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#a1a1aa',
                }}
              >
                <span>{part.lang}</span>
                <button
                  type="button"
                  onClick={() => copyCode(part.code!, idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedIndex === idx ? '#34d399' : '#a1a1aa',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                  }}
                >
                  {copiedIndex === idx ? '✓ Salin' : 'Salin Kod'}
                </button>
              </div>
              <pre
                style={{
                  padding: '12px',
                  margin: 0,
                  overflowX: 'auto',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12.5px',
                  color: '#f4f4f5',
                  lineHeight: 1.5,
                }}
              >
                <code>{part.code}</code>
              </pre>
            </div>
          );
        }

        // Render inline markdown for text (bold, list, subtopic headings, blockquotes, paragraphs)
        const lines = (part.text || '').split('\n');
        return (
          <div key={idx} style={{ margin: '6px 0' }}>
            {lines.map((line, lIdx) => {
              // Subtopic / Heading 3, 4, 5, 6 (### Subtopic)
              if (line.match(/^#{3,6}\s+/)) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      fontSize: '14.5px',
                      fontWeight: 650,
                      margin: '14px 0 6px',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{ color: '#0284c7', fontSize: '12px' }}>◈</span>
                    <span>{renderInline(line.replace(/^#{3,6}\s+/, ''))}</span>
                  </div>
                );
              }
              // Heading 2 (## Topic)
              if (line.startsWith('## ')) {
                return (
                  <h3
                    key={lIdx}
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      margin: '16px 0 6px',
                      color: '#ffffff',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      paddingBottom: '4px',
                    }}
                  >
                    {renderInline(line.slice(3))}
                  </h3>
                );
              }
              // Heading 1 (# Major Title)
              if (line.startsWith('# ')) {
                return (
                  <h2
                    key={lIdx}
                    style={{
                      fontSize: '18px',
                      fontWeight: 750,
                      margin: '18px 0 8px',
                      color: '#ffffff',
                    }}
                  >
                    {renderInline(line.slice(2))}
                  </h2>
                );
              }
              // Blockquote (> Notice / Callout)
              if (line.startsWith('> ')) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      margin: '8px 0',
                      padding: '8px 12px',
                      background: 'rgba(56,189,248,0.07)',
                      borderLeft: '3px solid #38bdf8',
                      borderRadius: '0 6px 6px 0',
                      fontSize: '12.5px',
                      color: '#bae6fd',
                    }}
                  >
                    {renderInline(line.slice(2))}
                  </div>
                );
              }
              // Numbered list (1. Item)
              const numMatch = line.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginLeft: '6px',
                      margin: '4px 0',
                      alignItems: 'baseline',
                    }}
                  >
                    <span
                      style={{
                        color: '#38bdf8',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {numMatch[1]}.
                    </span>
                    <span style={{ flex: 1 }}>{renderInline(numMatch[2])}</span>
                  </div>
                );
              }
              // Bullet item (- item, * item, • item)
              if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginLeft: '6px',
                      margin: '4px 0',
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ color: '#38bdf8', fontSize: '14px', lineHeight: 1 }}>•</span>
                    <span style={{ flex: 1 }}>{renderInline(line.replace(/^[-*•]\s+/, ''))}</span>
                  </div>
                );
              }
              // Regular paragraph
              return (
                <p key={lIdx} style={{ margin: '4px 0', minHeight: line.trim() ? undefined : '8px' }}>
                  {renderInline(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function AntigravityChatPage() {
  const DEFAULT_ROUTER_KEY = 'sk-0000000000000000-3ee33e-1a23c438';

  const normalizeModelId = (id: string | null): string => {
    if (!id) return 'kimi-web/k3';
    const legacyMap: Record<string, string> = {
      'sentinel-flagship': 'kimi-web/k3',
      'kimi-k3': 'kimi-web/k3',
      'glm-5.3-flash': 'zai-web/glm-5.2',
      'claude-3-5-sonnet': 'antigravity/claude-sonnet-4-6',
      'deepseek-r1': 'deepseek-web/expert',
      'gpt-4o': 'antigravity/gpt-oss-120b-medium',
    };
    return legacyMap[id] || id;
  };

  const [store, setStore] = useState<StoreData>(DEFAULT_STORE);
  const [selectedModel, setSelectedModel] = useState<string>('kimi-web/k3');
  const [inputVal, setInputVal] = useState<string>('');
  const [generatingChats, setGeneratingChats] = useState<Record<string, boolean>>({});
  const isCurrentChatGenerating = Boolean(store.activeChatId && generatingChats[store.activeChatId]);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [modelDropdownOpen, setModelDropdownOpen] = useState<boolean>(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<number, boolean>>({});

  // Settings
  const [baseUrl, setBaseUrl] = useState<string>('https://router.sentinelai.studio/v1');
  const [apiKey, setApiKey] = useState<string>(DEFAULT_ROUTER_KEY);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    'You are Antigravity, an elite software engineering and cybersecurity AI assistant. Provide concise, clean, and production-ready code with deep reasoning when requested.'
  );
  const [userName, setUserName] = useState<string>('Muhammad');

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize store and settings from localStorage
  useEffect(() => {
    try {
      const savedStore = localStorage.getItem('antigravity_store');
      if (savedStore) setStore(JSON.parse(savedStore));

      const savedModel = localStorage.getItem('ag_selected_model');
      if (savedModel) {
        const norm = normalizeModelId(savedModel);
        setSelectedModel(norm);
        localStorage.setItem('ag_selected_model', norm);
      } else {
        setSelectedModel('kimi-web/k3');
        localStorage.setItem('ag_selected_model', 'kimi-web/k3');
      }

      const savedUrl = localStorage.getItem('ag_base_url');
      if (savedUrl) setBaseUrl(savedUrl);

      const savedKey = localStorage.getItem('ag_api_key');
      if (savedKey && savedKey.trim()) {
        setApiKey(savedKey.trim());
      } else {
        setApiKey(DEFAULT_ROUTER_KEY);
        localStorage.setItem('ag_api_key', DEFAULT_ROUTER_KEY);
      }

      const savedPrompt = localStorage.getItem('ag_system_prompt');
      if (savedPrompt) setSystemPrompt(savedPrompt);

      const savedUser = localStorage.getItem('ag_user_name');
      if (savedUser) setUserName(savedUser);
    } catch {
      // Ignore
    }
  }, []);

  const persist = useCallback((newStore: StoreData) => {
    setStore(newStore);
    try {
      localStorage.setItem('antigravity_store', JSON.stringify(newStore));
    } catch {
      // Ignore
    }
  }, []);

  // Active project & active chat
  const activeProj = useMemo(() => {
    return store.projects.find((p) => p.id === store.activeProject) || store.projects[0];
  }, [store]);

  const activeChat = useMemo(() => {
    if (!store.activeChatId) return null;
    return activeProj?.conversations.find((c) => c.id === store.activeChatId) || null;
  }, [activeProj, store.activeChatId]);

  // Auto scroll
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeChat?.messages, isCurrentChatGenerating]);

  // Adjust textarea height
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputVal(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const selectProject = (pId: string) => {
    setStore((prevStore) => {
      const updated = { ...prevStore, activeProject: pId };
      try {
        localStorage.setItem('antigravity_store', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setProjectDropdownOpen(false);
  };

  const selectChat = (pId: string, cId: string) => {
    setStore((prevStore) => {
      const updated = {
        ...prevStore,
        activeProject: pId,
        activeChatId: cId,
        projects: prevStore.projects.map((p) => {
          if (p.id !== pId) return p;
          return {
            ...p,
            conversations: p.conversations.map((c) => (c.id === cId ? { ...c, hasUnread: false } : c)),
          };
        }),
      };
      try {
        localStorage.setItem('antigravity_store', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const newChat = () => {
    setStore((prevStore) => {
      const updated = { ...prevStore, activeChatId: null };
      try {
        localStorage.setItem('antigravity_store', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setInputVal('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleSend = async () => {
    const text = inputVal.trim();
    if (!text) return;

    const currProj = store.projects.find((p) => p.id === store.activeProject) || store.projects[0];
    const currChat = currProj.conversations.find((c) => c.id === store.activeChatId);

    const targetChatId = currChat ? currChat.id : `chat_${Date.now()}`;
    const targetProjId = currProj.id;

    if (generatingChats[targetChatId]) return;

    setInputVal('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setGeneratingChats((prev) => ({ ...prev, [targetChatId]: true }));

    const userMsg: Message = { role: 'user', content: text, timestamp: 'Now' };

    setStore((prevStore) => {
      const pIndex = prevStore.projects.findIndex((p) => p.id === targetProjId);
      if (pIndex === -1) return prevStore;
      const project = prevStore.projects[pIndex];
      const chatIndex = project.conversations.findIndex((c) => c.id === targetChatId);

      let updatedConversations: Conversation[];
      if (chatIndex === -1) {
        const newConversation: Conversation = {
          id: targetChatId,
          title: text.length > 28 ? `${text.slice(0, 28)}...` : text,
          time: 'Now',
          hasUnread: false,
          messages: [userMsg],
        };
        updatedConversations = [newConversation, ...project.conversations];
      } else {
        updatedConversations = project.conversations.map((c) =>
          c.id === targetChatId ? { ...c, messages: [...c.messages, userMsg] } : c
        );
      }

      const nextProjects = prevStore.projects.map((p, idx) =>
        idx === pIndex ? { ...p, conversations: updatedConversations } : p
      );

      const nextStore = {
        ...prevStore,
        activeProject: targetProjId,
        activeChatId: targetChatId,
        projects: nextProjects,
      };

      try {
        localStorage.setItem('antigravity_store', JSON.stringify(nextStore));
      } catch {}
      return nextStore;
    });

    // AI Completion request
    try {
      const msgsToSend = [
        { role: 'system', content: systemPrompt },
        ...(currChat ? currChat.messages : []),
        userMsg,
      ];

      const endpoint = baseUrl.endsWith('/v1')
        ? `${baseUrl}/chat/completions`
        : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const effectiveKey = (apiKey || DEFAULT_ROUTER_KEY).trim();
      if (effectiveKey) headers['Authorization'] = `Bearer ${effectiveKey}`;

      let res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: msgsToSend,
          temperature: 0.7,
        }),
      });

      let usedFallback = false;
      let fallbackModelName = '';

      if (
        !res.ok &&
        (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 500) &&
        selectedModel !== 'auto/best-fast' &&
        !selectedModel.startsWith('antigravity/')
      ) {
        console.warn(`Model ${selectedModel} returned ${res.status}, attempting automatic fallback to auto/best-fast...`);
        try {
          const fallbackRes = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: 'auto/best-fast',
              messages: msgsToSend,
              temperature: 0.7,
            }),
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
            usedFallback = true;
            fallbackModelName = 'auto/best-fast';
          }
        } catch {
          // ignore fallback error and report original
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
      }

      const data = await res.json();
      const choice = data.choices && data.choices[0];
      let replyContent = choice?.message?.content || choice?.text || '*(Empty reply)*';
      const reasoningContent = choice?.message?.reasoning_content || '';

      if (usedFallback) {
        replyContent =
          `> ℹ️ *Akaun sesi untuk model \`${selectedModel}\` sedang diperbaharui di gateway. Jawapan dialihkan secara automatik kepada model aktif \`${data.model || fallbackModelName}\`.*\n\n` +
          replyContent;
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: replyContent,
        reasoning: reasoningContent,
        timestamp: 'Now',
      };

      setStore((prevStore) => {
        const nextProjects = prevStore.projects.map((p) => {
          if (p.id !== targetProjId) return p;
          return {
            ...p,
            conversations: p.conversations.map((c) => {
              if (c.id !== targetChatId) return c;
              return { ...c, messages: [...c.messages, assistantMsg] };
            }),
          };
        });
        const nextStore = {
          ...prevStore,
          projects: nextProjects,
        };
        try {
          localStorage.setItem('antigravity_store', JSON.stringify(nextStore));
        } catch {}
        return nextStore;
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const assistantMsg: Message = {
        role: 'assistant',
        content: `⚠️ **Ralat Respons Model**: ${errMsg}\n\n*Petua*: Sila semak pautan Gateway di Settings (cth: \`https://router.sentinelai.studio/v1\`) atau pilih model yang berbeza dalam menu model.`,
        timestamp: 'Now',
      };

      setStore((prevStore) => {
        const nextProjects = prevStore.projects.map((p) => {
          if (p.id !== targetProjId) return p;
          return {
            ...p,
            conversations: p.conversations.map((c) => {
              if (c.id !== targetChatId) return c;
              return { ...c, messages: [...c.messages, assistantMsg] };
            }),
          };
        });
        const nextStore = {
          ...prevStore,
          projects: nextProjects,
        };
        try {
          localStorage.setItem('antigravity_store', JSON.stringify(nextStore));
        } catch {}
        return nextStore;
      });
    } finally {
      setGeneratingChats((prev) => {
        const next = { ...prev };
        delete next[targetChatId];
        return next;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const saveSettings = () => {
    localStorage.setItem('ag_base_url', baseUrl);
    localStorage.setItem('ag_api_key', apiKey);
    localStorage.setItem('ag_system_prompt', systemPrompt);
    localStorage.setItem('ag_user_name', userName);
    setSettingsOpen(false);
  };

  const activeModelObj = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 2px)',
        width: '100%',
        background: '#090a0c',
        color: '#ffffff',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ─── LEFT SUB-SIDEBAR (Projects & Chats) ─── */}
      <aside
        style={{
          width: isSidebarOpen ? '260px' : '0px',
          height: '100%',
          background: '#0c0d10',
          borderRight: isSidebarOpen ? '1px solid rgba(255,255,255,0.08)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
          zIndex: 20,
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: '#71717a', letterSpacing: '-0.01em', fontWeight: 600 }}>
              ANTIGRAVITY CONSOLE
            </span>
            <span style={{ fontSize: '10px', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '1px 6px', borderRadius: '4px' }}>
              PRO
            </span>
          </div>

          <button
            type="button"
            onClick={newChat}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#131418',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <span>+ Sesi Baru</span>
            <span style={{ fontSize: '10px', color: '#71717a' }}>Ctrl+K</span>
          </button>
        </div>

        {/* Projects & Chat List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          <div style={{ fontSize: '11px', color: '#52525b', textTransform: 'uppercase', padding: '4px 8px 8px', letterSpacing: '0.04em' }}>
            Workspaces & Repos
          </div>

          {store.projects.map((p) => {
            const isCurrentProj = p.id === store.activeProject;
            return (
              <div key={p.id} style={{ marginBottom: '12px' }}>
                <div
                  onClick={() => selectProject(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isCurrentProj ? 'rgba(255,255,255,0.04)' : 'transparent',
                    color: isCurrentProj ? '#ffffff' : '#a1a1aa',
                    fontSize: '12.5px',
                    fontWeight: isCurrentProj ? 600 : 400,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span>📁</span>
                    <span>{p.name}</span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#52525b' }}>{p.conversations.length}</span>
                </div>

                {/* Sublist */}
                <div style={{ marginLeft: '12px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
                  {p.conversations.map((c) => {
                    const isCurrentChat = c.id === store.activeChatId;
                    const isChatGenerating = Boolean(generatingChats[c.id]);
                    return (
                      <div
                        key={c.id}
                        onClick={() => selectChat(p.id, c.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          background: isCurrentChat ? '#1b1c22' : 'transparent',
                          color: isCurrentChat ? '#ffffff' : '#71717a',
                          fontSize: '12px',
                          margin: '2px 0',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                          {isChatGenerating && (
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#38bdf8',
                                boxShadow: '0 0 8px #38bdf8',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: isChatGenerating ? '130px' : '170px',
                            }}
                          >
                            {c.title}
                          </span>
                        </div>
                        {isChatGenerating ? (
                          <span style={{ fontSize: '9.5px', color: '#38bdf8', fontFamily: 'monospace' }}>memproses...</span>
                        ) : (
                          c.time && <span style={{ fontSize: '10px', color: '#52525b' }}>{c.time}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ⚙️ Tetapan Gateway
          </button>
          <a
            href="/chat.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '11px', color: '#38bdf8', textDecoration: 'none' }}
            title="Buka paparan penuh mandiri di tab baru"
          >
            Tab Penuh ↗
          </a>
        </div>
      </aside>

      {/* ─── MAIN CHAT AREA ─── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        {/* Top Header */}
        <header
          style={{
            height: '46px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#0c0d10',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Togol Menu Projek"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
              <span style={{ color: '#a1a1aa' }}>{activeProj.name}</span>
              <span style={{ color: '#52525b' }}>/</span>
              <span style={{ color: '#ffffff', fontWeight: 500 }}>
                {activeChat ? activeChat.title : 'Sesi Baru'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.2)',
                padding: '3px 10px 3px 6px',
                borderRadius: '999px',
              }}
            >
              <ModelLogo type={activeModelObj.icon} size={18} />
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#38bdf8',
                  fontWeight: 600,
                }}
              >
                {activeModelObj.name}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Message List / Empty State */}
        <div
          ref={chatScrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px 140px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!activeChat || activeChat.messages.length === 0 ? (
            /* Empty State */
            <div
              style={{
                margin: 'auto',
                maxWidth: '620px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))',
                  border: '1px solid rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}
              >
                <svg width="34" height="34" viewBox="0 0 64 64" fill="none">
                  <rect width="64" height="64" rx="16" fill="url(#crestBg)" />
                  <path d="M32 10 L52 50 L12 50 Z" stroke="#ffffff" strokeWidth="2.5" fill="none" />
                  <circle cx="32" cy="35" r="4" fill="#38bdf8" />
                  <defs>
                    <linearGradient id="crestBg" x1="0" y1="0" x2="64" y2="64">
                      <stop offset="0%" stopColor="#1e2029" />
                      <stop offset="100%" stopColor="#090a0f" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <h1 style={{ fontSize: '24px', fontWeight: 650, color: '#ffffff', marginBottom: '8px' }}>
                Hi {userName}, ada apa yang boleh dibina hari ini?
              </h1>
              <p style={{ fontSize: '13.5px', color: '#a1a1aa', maxWidth: '520px', lineHeight: 1.5, marginBottom: '28px' }}>
                Konsol AI Sentinel bersambung terus ke model AI Gateway rasmi (Moonshot Kimi K3, Claude Sonnet 4.6, Gemini 3 Flash, DeepSeek R1, Grok 4.7), pangkalan kod projek, dan mikroservis anda.
              </p>

              {/* 4 Quick Action Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%' }}>
                {[
                  {
                    title: '🛡️ Audit Keselamatan & CVE',
                    desc: 'Semak pentest platform FYP2, kelemahan API, dan pengesanan ancaman siber.',
                    prompt: 'Lakukan audit keselamatan ringkas untuk seni bina Sentinel Hub dan database fyp2.db.',
                  },
                  {
                    title: '⚡ Semakan Port & Mikroservis',
                    desc: 'Pantau status SentinelMaster, SentinelTree (8007), SentinelAlong (8028), dan Router (20128).',
                    prompt: 'Berikan ringkasan port mikroservis aktif dan cara pengesahan status setiap satu.',
                  },
                  {
                    title: '💻 Seni Bina Frontend & UI',
                    desc: 'Bina komponen Next.js/React elegan, gelap dan berprestasi tinggi.',
                    prompt: 'Tunjukkan contoh kod komponen React minimalis untuk status pelayan masa nyata.',
                  },
                  {
                    title: '🚀 Pelancaran & Skrip Deploy',
                    desc: 'Konfigurasi PM2 ecosystem, runner Docker Kali Linux, dan integrasi GitHub.',
                    prompt: 'Jelaskan peraturan pengurusan port PM2 dan langkah selamat deploy ke Kali Linux.',
                  },
                ].map((card, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setInputVal(card.prompt);
                      if (textareaRef.current) textareaRef.current.focus();
                    }}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)';
                      e.currentTarget.style.background = 'rgba(56,189,248,0.03)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5', marginBottom: '4px' }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#71717a', lineHeight: 1.4 }}>
                      {card.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Message Feed */
            <div style={{ maxWidth: '780px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeChat.messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      width: '100%',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '4px', padding: '0 4px' }}>
                      {isUser ? userName : activeModelObj.name}
                    </div>

                    <div
                      style={{
                        maxWidth: '90%',
                        borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                        padding: isUser ? '10px 16px' : '14px 18px',
                        background: isUser ? '#1e2028' : '#111217',
                        border: isUser ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.07)',
                        color: '#ffffff',
                      }}
                    >
                      {/* Reasoning Box if present */}
                      {msg.reasoning && (
                        <div style={{ marginBottom: '12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                          <div
                            onClick={() =>
                              setExpandedReasoning((prev) => ({ ...prev, [index]: !prev[index] }))
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: 'rgba(255,255,255,0.03)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: '#a1a1aa',
                            }}
                          >
                            <span>🧠 Proses Pemikiran (Reasoning)</span>
                            <span style={{ fontSize: '10px' }}>
                              {expandedReasoning[index] ? 'Tutup ▲' : 'Buka ▼'}
                            </span>
                          </div>
                          {expandedReasoning[index] && (
                            <div style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', fontSize: '12px', color: '#a1a1aa', lineHeight: 1.5, fontFamily: 'monospace' }}>
                              {msg.reasoning}
                            </div>
                          )}
                        </div>
                      )}

                      <FormattedMessage content={msg.content} />
                    </div>
                  </div>
                );
              })}

              {/* Generating loading indicator */}
              {isGenerating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '12.5px', padding: '6px 0' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1s infinite' }} />
                  <span>Sedang memproses dengan {activeModelObj.name}...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── FLOATING BOTTOM INPUT CAPSULE ─── */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '780px',
            width: 'calc(100% - 32px)',
            background: 'rgba(18, 19, 23, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '10px 14px 10px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 30,
          }}
        >
          {/* Top row badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', position: 'relative' }}>
            {/* Project Picker Pill */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setProjectDropdownOpen(!projectDropdownOpen);
                  setModelDropdownOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  color: '#e4e4e7',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <span>📁 {activeProj.name}</span>
                <span style={{ fontSize: '9px', color: '#71717a' }}>▼</span>
              </button>

              {projectDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '110%',
                    left: 0,
                    width: '180px',
                    background: '#15161b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    padding: '4px',
                    zIndex: 50,
                  }}
                >
                  {store.projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => selectProject(p.id)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: p.id === store.activeProject ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: p.id === store.activeProject ? '#38bdf8' : '#e4e4e7',
                        fontSize: '11.5px',
                      }}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <span style={{ color: '#52525b', padding: '1px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
              Local Workspace
            </span>
          </div>

          {/* Auto-expanding Input Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputVal}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Tanya soalan, jana kod, atau jalankan arahan... (Enter untuk hantar, Shift+Enter untuk baris baru)"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '13.5px',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              resize: 'none',
              maxHeight: '180px',
              padding: '2px 0',
            }}
          />

          {/* Bottom row tools */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              {/* Model Picker Pill */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(!modelDropdownOpen);
                    setProjectDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ModelLogo type={activeModelObj.icon} size={18} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 550 }}>
                    {activeModelObj.name}
                  </span>
                  <span style={{ fontSize: '9px', color: '#71717a' }}>▼</span>
                </button>

                {modelDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '125%',
                      left: 0,
                      width: '320px',
                      maxHeight: '380px',
                      overflowY: 'auto',
                      background: '#121318',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
                      padding: '6px',
                      zIndex: 50,
                    }}
                  >
                    <div
                      style={{
                        padding: '6px 8px 4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#71717a',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Model AI Rasmi (Tiada Nama Palsu)
                    </div>
                    {AVAILABLE_MODELS.map((m) => {
                      const isSelected = m.id === selectedModel;
                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m.id);
                            localStorage.setItem('ag_selected_model', m.id);
                            setModelDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '7px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(56,189,248,0.12)' : 'transparent',
                            border: isSelected ? '1px solid rgba(56,189,248,0.25)' : '1px solid transparent',
                            marginBottom: '2px',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <ModelLogo type={m.icon} size={22} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: '12px',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: isSelected ? '#38bdf8' : '#f4f4f5',
                                }}
                              >
                                {m.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(255,255,255,0.06)',
                                  color: '#a1a1aa',
                                }}
                              >
                                {m.provider}
                              </span>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#71717a', marginTop: '2px' }}>
                              {m.note}
                            </div>
                          </div>
                          {isSelected && <span style={{ color: '#38bdf8', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <span
                style={{
                  fontSize: '11px',
                  color: '#34d399',
                  background: 'rgba(16,185,129,0.1)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}
              >
                ⚡ Turbo
              </span>
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isGenerating || !inputVal.trim()}
              style={{
                background: inputVal.trim() && !isGenerating ? '#ffffff' : 'rgba(255,255,255,0.1)',
                color: inputVal.trim() && !isGenerating ? '#090a0c' : '#71717a',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: inputVal.trim() && !isGenerating ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s',
              }}
            >
              <span>Hantar</span>
              <span>↑</span>
            </button>
          </div>
        </div>
      </main>

      {/* ─── SETTINGS MODAL ─── */}
      {settingsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: '460px',
              background: '#131418',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 650, color: '#fff' }}>Tetapan AI Gateway</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '16px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12.5px' }}>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px' }}>
                  Gateway Base URL (Sentinel Router / OmniRoute)
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1a1b22',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px' }}>
                  API Key Gateway (Pilihan jika guna akses terbuka)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  style={{
                    width: '100%',
                    background: '#1a1b22',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px' }}>Nama Pengguna</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1a1b22',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px' }}>Arahan Sistem (System Prompt)</label>
                <textarea
                  rows={3}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1a1b22',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#fff',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#a1a1aa',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={saveSettings}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 16px',
                  color: '#090a0c',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
