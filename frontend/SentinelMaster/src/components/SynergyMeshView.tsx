'use client';

import { useState, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';
import type { SecurityAuditResult, ProjectPromoResult, GrokReviewResult } from '@/lib/synergy';

export default function SynergyMeshView() {
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('SentinelAPI');
  const [activeWorkflow, setActiveWorkflow] = useState<'audit' | 'promo' | 'review' | 'vocal'>('audit');
  const [loading, setLoading] = useState(false);

  const [auditResult, setAuditResult] = useState<SecurityAuditResult | null>(null);
  const [promoResult, setPromoResult] = useState<ProjectPromoResult | null>(null);
  const [reviewResult, setReviewResult] = useState<GrokReviewResult | null>(null);
  const [vocalText, setVocalText] = useState<string | null>(null);

  // Load project list
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/god-view');
        if (res.ok) {
          const json = await res.json();
          if (json.data?.nodes) {
            const names = json.data.nodes.map((n: any) => n.name);
            setProjects(names);
            if (names.length > 0 && !names.includes(selectedTarget)) {
              setSelectedTarget(names[0]);
            }
          }
        }
      } catch {
        // fallback
      }
    };
    fetchProjects();
  }, []);

  // 1. Run SentinelThreat Security Audit
  const executeAudit = async () => {
    setLoading(true);
    setAuditResult(null);
    try {
      const res = await fetch('/api/synergy/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedTarget }),
      });
      if (res.ok) {
        const json = await res.json();
        setAuditResult(json.data);
      }
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  // 2. Run HyperFrames Promo Generator
  const executePromo = async () => {
    setLoading(true);
    setPromoResult(null);
    try {
      const res = await fetch('/api/synergy/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedTarget }),
      });
      if (res.ok) {
        const json = await res.json();
        setPromoResult(json.data);
      }
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  // 3. Run Grok Git & Code Review
  const executeReview = async () => {
    setLoading(true);
    setReviewResult(null);
    try {
      const res = await fetch('/api/synergy/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: selectedTarget }),
      });
      if (res.ok) {
        const json = await res.json();
        setReviewResult(json.data);
      }
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  // 4. Run Vocal Briefing
  const executeVocalBrief = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/synergy/vocal-brief');
      if (res.ok) {
        const json = await res.json();
        const text = json.data?.speechText || '';
        setVocalText(text);

        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Synergy Mesh"
        subtitle="Inter-Project Collaboration Engine · Cross-Service Defense, Code Synthesis & Media Generation"
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn sm primary" onClick={executeVocalBrief} disabled={loading}>
            🎙️ Vocal Status Briefing
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {/* Synergy Topology Summary */}
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <Stat label="Connected Projects" value={String(projects.length)} foot="Active in synergy network" />
          <Stat label="Synergy Modes" value="4 Autonomous" foot="Security, Media, Grok, Voice" />
          <Stat label="Inter-Project Bus" value="ACTIVE" foot="Zero-latency localhost mesh" />
          <Stat label="Target Project" value={selectedTarget} foot="Selected assistance receiver" />
        </div>

        {/* Workflow Selector Bar */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Select Target Project:</span>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="input"
                style={{ width: 220 }}
              >
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn sm ${activeWorkflow === 'audit' ? 'primary' : 'ghost'}`}
                onClick={() => setActiveWorkflow('audit')}
              >
                🛡️ SentinelThreat Shield
              </button>
              <button
                type="button"
                className={`btn sm ${activeWorkflow === 'promo' ? 'primary' : 'ghost'}`}
                onClick={() => setActiveWorkflow('promo')}
              >
                🎬 HyperFrames Promo
              </button>
              <button
                type="button"
                className={`btn sm ${activeWorkflow === 'review' ? 'primary' : 'ghost'}`}
                onClick={() => setActiveWorkflow('review')}
              >
                🤖 Grok Bot Review
              </button>
              <button
                type="button"
                className={`btn sm ${activeWorkflow === 'vocal' ? 'primary' : 'ghost'}`}
                onClick={() => setActiveWorkflow('vocal')}
              >
                🎙️ Vocal Briefing
              </button>
            </div>
          </div>
        </Card>

        {/* Active Synergy Pane */}
        {activeWorkflow === 'audit' ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15 }}>🛡️ SentinelThreat Shield Audit</h3>
                <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  SentinelThreat inspects <strong>{selectedTarget}</strong> for exposed credentials, unignored .env files,
                  and configuration vulnerabilities.
                </p>
              </div>
              <button type="button" className="btn primary" onClick={executeAudit} disabled={loading}>
                {loading ? 'Scanning…' : `Scan ${selectedTarget}`}
              </button>
            </div>

            {auditResult ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: auditResult.score >= 80 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${auditResult.score >= 80 ? '#34d399' : '#ef4444'}`,
                      fontSize: 18,
                      fontWeight: 800,
                      color: auditResult.score >= 80 ? '#34d399' : '#ef4444',
                    }}
                  >
                    Security Score: {auditResult.score} / 100
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{auditResult.summary}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditResult.findings.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 6,
                        background: 'var(--panel-2)',
                        borderLeft: `3px solid ${
                          f.severity === 'critical' ? '#ef4444' : f.severity === 'high' ? '#f59e0b' : '#34d399'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ fontSize: 13 }}>{f.category}</strong>
                        <span className={`badge ${f.severity === 'critical' ? 'red' : f.severity === 'high' ? 'amber' : 'green'}`}>
                          {f.severity.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, margin: '0 0 6px 0', color: 'var(--text)' }}>{f.message}</p>
                      <div style={{ fontSize: 11, color: 'var(--accent)' }}>
                        <strong>Fix Suggestion:</strong> {f.fixSuggestion}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {activeWorkflow === 'promo' ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15 }}>🎬 HyperFrames Video Promo Generator</h3>
                <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  HyperFrames generates deterministic code-to-video assets for <strong>{selectedTarget}</strong>.
                </p>
              </div>
              <button type="button" className="btn primary" onClick={executePromo} disabled={loading}>
                {loading ? 'Synthesizing…' : `Generate Video for ${selectedTarget}`}
              </button>
            </div>

            {promoResult ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>Preview: {promoResult.title}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Duration: {promoResult.duration}s</span>
                </div>
                <div
                  style={{
                    height: 280,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid var(--line)',
                    background: '#000',
                  }}
                >
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><style>${promoResult.css}</style></head><body>${promoResult.html}</body></html>`}
                    title="Promo Preview"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {activeWorkflow === 'review' ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15 }}>🤖 Grok Bot Code Review & Commit Assistant</h3>
                <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Grok Bot analyzes git status and diffs for <strong>{selectedTarget}</strong> to suggest conventional commits.
                </p>
              </div>
              <button type="button" className="btn primary" onClick={executeReview} disabled={loading}>
                {loading ? 'Analyzing…' : `Review ${selectedTarget}`}
              </button>
            </div>

            {reviewResult ? (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: 'var(--panel-2)',
                    marginBottom: 12,
                    borderLeft: `3px solid ${reviewResult.isDirty ? '#f59e0b' : '#34d399'}`,
                  }}
                >
                  <div style={{ fontSize: 13, marginBottom: 6 }}>{reviewResult.reviewNotes}</div>
                  {reviewResult.isDirty ? (
                    <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                      Suggested Commit:{' '}
                      <code>
                        {reviewResult.suggestedCommit.type}({reviewResult.suggestedCommit.scope}):{' '}
                        {reviewResult.suggestedCommit.message}
                      </code>
                    </div>
                  ) : null}
                </div>

                {reviewResult.statusOutput.length > 0 ? (
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                      Changed Files Detected:
                    </span>
                    <pre
                      style={{
                        padding: 12,
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 6,
                        fontSize: 11,
                        color: 'var(--amber)',
                      }}
                    >
                      {reviewResult.statusOutput.join('\n')}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {activeWorkflow === 'vocal' ? (
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🎙️ Vocal Status Briefing</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
              SentinelTouch synthesizes and broadcasts a real-time vocal briefing across all ecosystem projects.
            </p>
            {vocalText ? (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 8,
                  background: 'rgba(79, 140, 255, 0.1)',
                  border: '1px solid rgba(79, 140, 255, 0.3)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                &ldquo;{vocalText}&rdquo;
              </div>
            ) : (
              <button type="button" className="btn primary" onClick={executeVocalBrief} disabled={loading}>
                {loading ? 'Synthesizing…' : 'Generate & Speak Status Briefing'}
              </button>
            )}
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
