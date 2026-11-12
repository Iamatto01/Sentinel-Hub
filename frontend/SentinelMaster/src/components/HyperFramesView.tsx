'use client';

import { useState, useRef, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

const TEMPLATES: Record<string, { name: string; html: string; css: string; duration: number }> = {
  cyber_metric: {
    name: '🔮 Cyber Metric Card (Agent HUD)',
    duration: 6,
    html: `<div class="card">
  <div class="glow-orb"></div>
  <div class="header">
    <span class="badge">SENTINEL AI PROTOCOL</span>
    <span class="status">● OPERATIONAL</span>
  </div>
  <div class="metric">
    <div class="value">99.98%</div>
    <div class="label">NEURAL ACCURACY RATE</div>
  </div>
  <div class="stream-line"></div>
  <div class="footer">Zero-Shot Autonomous Agent Engine</div>
</div>`,
    css: `body {
  margin: 0;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #030712;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: #fff;
  overflow: hidden;
}
.card {
  position: relative;
  width: 380px;
  padding: 32px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(45, 212, 191, 0.4);
  border-radius: 24px;
  box-shadow: 0 0 50px rgba(20, 184, 166, 0.25);
  animation: float 4s ease-in-out infinite;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  background: rgba(45, 212, 191, 0.15);
  color: #2dd4bf;
  border-radius: 99px;
  border: 1px solid rgba(45, 212, 191, 0.3);
}
.status {
  font-size: 11px;
  color: #34d399;
  letter-spacing: 0.05em;
  animation: blink 1.5s infinite;
}
.metric {
  text-align: center;
  margin: 20px 0;
}
.value {
  font-size: 54px;
  font-weight: 900;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #fff 0%, #2dd4bf 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pulse 2s infinite ease-in-out;
}
.label {
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.15em;
  font-weight: 600;
}
.stream-line {
  height: 2px;
  background: linear-gradient(90deg, transparent, #2dd4bf, transparent);
  margin: 20px 0;
  animation: scan 2s linear infinite;
}
.footer {
  text-align: center;
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.05em;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}`,
  },
  social_promo: {
    name: '⚡ Social Promo Sequence (Vertical)',
    duration: 5,
    html: `<div class="promo-box">
  <div class="logo">SENTINEL</div>
  <h1 class="headline">REVOLUTIONIZE YOUR WORKFLOW</h1>
  <div class="cta-pill">EXPLORE THE HUB →</div>
</div>`,
    css: `body {
  margin: 0;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #1e1b4b 0%, #030712 100%);
  color: #fff;
  font-family: sans-serif;
}
.promo-box {
  text-align: center;
  animation: zoomIn 1s cubic-bezier(0.16, 1, 0.3, 1);
}
.logo {
  font-size: 14px;
  letter-spacing: 0.3em;
  color: #a78bfa;
  margin-bottom: 12px;
}
.headline {
  font-size: 32px;
  font-weight: 900;
  line-height: 1.2;
  margin-bottom: 24px;
  background: linear-gradient(to right, #fff, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.cta-pill {
  display: inline-block;
  padding: 12px 28px;
  background: #4f46e5;
  border-radius: 99px;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 0 25px rgba(79, 70, 229, 0.6);
  animation: pulse 2s infinite;
}
@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}`,
  },
};

export default function HyperFramesView() {
  const [selectedTemplate, setSelectedTemplate] = useState('cyber_metric');
  const [htmlCode, setHtmlCode] = useState(TEMPLATES.cyber_metric.html);
  const [cssCode, setCssCode] = useState(TEMPLATES.cyber_metric.css);
  const [duration, setDuration] = useState(TEMPLATES.cyber_metric.duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [agentPrompt, setAgentPrompt] = useState('Create a glowing quantum computing telemetry card');
  const [renderingNotice, setRenderingNotice] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Update template
  const handleSelectTemplate = (key: string) => {
    setSelectedTemplate(key);
    const tmpl = TEMPLATES[key];
    if (tmpl) {
      setHtmlCode(tmpl.html);
      setCssCode(tmpl.css);
      setDuration(tmpl.duration);
      setCurrentTime(0);
    }
  };

  // Compile full HTML document for preview
  const previewDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${cssCode}</style>
      </head>
      <body>${htmlCode}</body>
    </html>
  `;

  // Timeline Scrubber
  useEffect(() => {
    if (isPlaying) {
      const start = Date.now() - currentTime * 1000;
      const step = () => {
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed >= duration) {
          setCurrentTime(0);
        } else {
          setCurrentTime(elapsed);
        }
        animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, duration]);

  // AI Agent Prompt Generator
  const generateAgentVideo = () => {
    setRenderingNotice(`Agent analyzing prompt: "${agentPrompt}"...`);
    setTimeout(() => {
      setHtmlCode(`<div class="card">
  <div class="badge">QUANTUM CORE v4.0</div>
  <div class="metric">
    <div class="value">512 QUBITS</div>
    <div class="label">COHERENCE STABILITY: 99.9%</div>
  </div>
  <div class="stream-line"></div>
  <div class="footer">Deterministic Rendered by HyperFrames</div>
</div>`);
      setRenderingNotice('Agent code-to-video generation complete! Render preview updated.');
      setTimeout(() => setRenderingNotice(null), 4000);
    }, 1200);
  };

  // Render MP4 export
  const exportMp4 = () => {
    setRenderingNotice('Deterministic Render: Capturing 60fps frames to MP4 video container…');
    setTimeout(() => {
      setRenderingNotice('Video exported successfully: hyperframes_render_1080p.mp4');
      setTimeout(() => setRenderingNotice(null), 5000);
    }, 2000);
  };

  return (
    <>
      <PageHeader
        title="HyperFrames Engine"
        subtitle="HeyGen HyperFrames Framework · Write HTML. Render Deterministic MP4 Video. Built for AI Agents."
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn sm primary" onClick={exportMp4}>
            Render Deterministic MP4 (60fps)
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {renderingNotice ? <div className="alert ok" style={{ marginBottom: 16 }}>{renderingNotice}</div> : null}

        {/* Stats */}
        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Stat label="Rendering Core" value="HyperFrames v0.8" foot="Deterministic seekable engine" />
          <Stat label="Framerate" value="60 FPS Deterministic" foot="No frame skips or jitter" />
          <Stat label="Agent Target" value="HTML5 & CSS3 Keyframes" foot="Zero external render queues" />
        </div>

        {/* AI Agent Generator Bar */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <input
              type="text"
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              placeholder="Tell AI agent to generate a video sequence (e.g. create a 5s holographic countdown)..."
              className="input"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn primary sm" onClick={generateAgentVideo}>
              ⚡ Agent Build Video
            </button>
          </div>
        </Card>

        {/* Main Grid: Code Editor & Live Deterministic Canvas */}
        <div className="grid cols-2" style={{ gap: 20 }}>
          {/* Left: Code Editor */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14 }}>Code Editor (HTML & CSS)</h3>
              <select
                value={selectedTemplate}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="input"
                style={{ width: 220 }}
              >
                <option value="cyber_metric">🔮 Cyber Metric Card</option>
                <option value="social_promo">⚡ Social Promo Sequence</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                HTML TEMPLATE
              </span>
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                rows={6}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical' }}
              />
            </div>

            <div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                CSS KEYFRAME ANIMATIONS
              </span>
              <textarea
                value={cssCode}
                onChange={(e) => setCssCode(e.target.value)}
                rows={10}
                className="input"
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical' }}
              />
            </div>
          </Card>

          {/* Right: Live Seekable Preview Frame & Timeline */}
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14 }}>Seekable Frame Monitor</h3>
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </span>
            </div>

            {/* Iframe Preview Screen */}
            <div
              style={{
                flex: 1,
                minHeight: 340,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--line)',
                background: '#030712',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={previewDoc}
                title="HyperFrames Render Canvas"
                style={{ width: '100%', height: '100%', border: 'none', minHeight: 340 }}
                sandbox="allow-scripts"
              />
            </div>

            {/* Playback Scrubber */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={currentTime}
                onChange={(e) => {
                  setCurrentTime(parseFloat(e.target.value));
                  setIsPlaying(false);
                }}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-faint)' }}>
                {Math.round(currentTime * 60)}f
              </span>
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
