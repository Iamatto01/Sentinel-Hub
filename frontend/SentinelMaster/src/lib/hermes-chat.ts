'use client';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'hermes';
  text: string;
  timestamp: string;
  action?: string;
  model?: string;
  persona?: string;
}

export const HERMES_CHAT_STORAGE_KEY = 'hermes_chat_history';
export const HERMES_CHAT_EVENT = 'hermes_chat_updated';

export const INITIAL_HERMES_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    sender: 'hermes',
    text: 'Salam & Selamat datang ke Hermes Agent AI v0.23.0. Saya adalah ejen autonomi pelbagai platform anda yang bersambung terus ke rangkaian Sentinel Fleet. Bersedia menerima arahan pentadbiran server, semakan telemetri, dan automasi AI.',
    timestamp: 'Sedia',
  },
];

export function getStoredHermesMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return INITIAL_HERMES_MESSAGES;
  try {
    const raw = localStorage.getItem(HERMES_CHAT_STORAGE_KEY);
    if (!raw) return INITIAL_HERMES_MESSAGES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Ignore parse errors
  }
  return INITIAL_HERMES_MESSAGES;
}

export function saveStoredHermesMessages(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HERMES_CHAT_STORAGE_KEY, JSON.stringify(messages));
    window.dispatchEvent(new CustomEvent(HERMES_CHAT_EVENT, { detail: messages }));
  } catch {
    // Ignore storage quota
  }
}
