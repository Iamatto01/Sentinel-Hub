'use client';

import { useState, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

export default function SettingsView() {
  const [config, setConfig] = useState({
    geminiApiKey: '',
    groqApiKey: '',
    elevenLabsApiKey: '',
    geminiWebUrl: 'http://localhost:3000/v1',
    defaultProvider: 'smart-offline',
    voiceRate: 1.05,
    voicePitch: 1.0,
    wakeWord: 'sentinel',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadCfg = async () => {
      try {
        const res = await fetch('/api/touch/config');
        if (res.ok) {
          const json = await res.json();
          if (json.data) setConfig((prev) => ({ ...prev, ...json.data }));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    loadCfg();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/touch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSavedNotice('Settings saved successfully!');
        setTimeout(() => setSavedNotice(null), 4000);
      }
    } catch {
      setSavedNotice('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings & API Configuration"
        subtitle="Configure Neural Core API Keys, Voice Profiles, and Hub Integration Preferences"
      >
        <button type="button" className="btn primary sm" disabled={saving} onClick={saveSettings}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </PageHeader>

      <PageBody>
        {savedNotice ? <div className="alert ok" style={{ marginBottom: 16 }}>{savedNotice}</div> : null}

        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Stat label="Active Brain" value={config.defaultProvider.toUpperCase()} foot="Default AI inference pipeline" />
          <Stat label="Wake Word" value={`"${config.wakeWord}"`} foot="Duplex trigger phrase" />
          <Stat label="Voice Modulation" value={`${config.voiceRate}x rate`} foot={`${config.voicePitch}x pitch`} />
        </div>

        <div className="grid cols-2" style={{ gap: 20 }}>
          {/* AI Providers & Keys */}
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>🧠 Neural Brain API Keys</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Default AI Provider
              </label>
              <select
                value={config.defaultProvider}
                onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value })}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="smart-offline">🤖 Offline Smart Assistant (Instant local rules)</option>
                <option value="gemini-web">⚡ Gemini Web API (Local Server)</option>
                <option value="gemini-api">🧠 Google Gemini 2.0 (AI Studio API)</option>
                <option value="groq">🚀 Groq Cloud Llama-3.3 (500 tok/s)</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Google AI Studio Key (Gemini 2.0 Flash & Pro)
              </label>
              <input
                type="password"
                value={config.geminiApiKey}
                onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                placeholder="AIzaSy..."
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Enables live screen vision multimodal reasoning & zero-lag chat.
              </span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Groq Cloud API Key (Llama-3.3-70B / DeepSeek-R1)
              </label>
              <input
                type="password"
                value={config.groqApiKey}
                onChange={(e) => setConfig({ ...config, groqApiKey: e.target.value })}
                placeholder="gsk_..."
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Free high-speed cloud inference from console.groq.com.
              </span>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Gemini Web API Server URL
              </label>
              <input
                type="text"
                value={config.geminiWebUrl}
                onChange={(e) => setConfig({ ...config, geminiWebUrl: e.target.value })}
                placeholder="http://localhost:3000/v1"
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)' }}
              />
            </div>
          </Card>

          {/* Voice & Assistant Controls */}
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>🎙️ Voice & Audio Synthesis</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                ElevenLabs API Key (Optional Cloud Clone)
              </label>
              <input
                type="password"
                value={config.elevenLabsApiKey}
                onChange={(e) => setConfig({ ...config, elevenLabsApiKey: e.target.value })}
                placeholder="sk_..."
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Optional. Open-source F5-TTS / XTTS zero-shot voice cloning works for free in Voice Studio.
              </span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Assistant Wake Word
              </label>
              <input
                type="text"
                value={config.wakeWord}
                onChange={(e) => setConfig({ ...config, wakeWord: e.target.value })}
                placeholder="sentinel"
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Speech Rate ({config.voiceRate}x)
              </label>
              <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.05}
                value={config.voiceRate}
                onChange={(e) => setConfig({ ...config, voiceRate: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Speech Pitch ({config.voicePitch}x)
              </label>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={config.voicePitch}
                onChange={(e) => setConfig({ ...config, voicePitch: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
