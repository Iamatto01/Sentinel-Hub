'use client';

import { useState, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat, Badge, Tabs } from './ui';

interface MCQ {
  id: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  mitre_technique?: string;
}

interface CurriculumItem {
  day: number;
  title: string;
  category: string;
  summary: string;
  notebooklm_ref?: string;
}

export default function CyberMasterView() {
  const [day, setDay] = useState(3);
  const [metadata, setMetadata] = useState<any>(null);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab: 'videos' | 'exam' | 'roadmap'
  const [activeTab, setActiveTab] = useState('videos');
  const [videoFormat, setVideoFormat] = useState<'deepdive' | 'short'>('deepdive');

  // Exam state
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [instantFeedback, setInstantFeedback] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);

  useEffect(() => {
    loadDayData(day);
  }, [day]);

  const loadDayData = async (dayNum: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cybermaster?day=${dayNum}`);
      if (res.ok) {
        const json = await res.json();
        const data = (json && json.data) ? json.data : json;
        if (data.metadata) setMetadata(data.metadata);
        if (data.mcqs) setMcqs(data.mcqs);
        if (data.curriculum) setCurriculum(data.curriculum);
        setAnswers({});
        setSubmitted(false);
        setScoreResult(null);
        setQIndex(0);
      }
    } catch (err) {
      console.error('Failed to load CyberMaster data:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentQ = mcqs[qIndex];
  const answeredCount = Object.keys(answers).length;

  const handleSelectOption = (optLetter: string) => {
    if (submitted || !currentQ) return;
    setAnswers({ ...answers, [String(currentQ.id)]: optLetter });
  };

  const handleSubmitExam = async () => {
    if (answeredCount === 0) {
      alert('Please answer questions before submitting!');
      return;
    }
    setSubmitted(true);
    let correct = 0;
    mcqs.forEach((q) => {
      if (answers[String(q.id)]?.toUpperCase() === q.correct_answer.toUpperCase()) {
        correct++;
      }
    });
    const pct = Math.round((correct / mcqs.length) * 100);
    setScoreResult({
      total: mcqs.length,
      correct,
      pct,
      passed: pct >= 80,
    });
  };

  return (
    <>
      <PageHeader
        title="CyberMaster Bot"
        subtitle="Autonomous Cybersecurity Video Engine · 20 Daily MCQs · NotebookLM Synchronized Pipeline"
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: '#0f172a',
              border: '1px solid #1e293b',
              color: '#00e5ff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {(curriculum.length > 0 ? curriculum : [
              { day: 1, title: 'Day 01: Reconnaissance Internals' },
              { day: 2, title: 'Day 02: Network Security Analysis' },
              { day: 3, title: 'Day 03: Lateral Movement Defense' }
            ]).map((c) => (
              <option key={c.day} value={c.day} style={{ background: '#0f172a', color: '#fff' }}>
                Day {String(c.day).padStart(2, '0')}: {c.title.slice(0, 30)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm primary"
            onClick={() => loadDayData(day)}
          >
            🔄 Sync Data
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {/* Top Summary Stats */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <Stat label="Current Mission" value={`Day ${String(day).padStart(2, '0')}`} foot={metadata?.category || "Enterprise Threat Defense"} />
          <Stat label="Rendered Videos" value="2 MP4 Files" foot="16:9 Deep Dive + 9:16 Reel" />
          <Stat label="Daily MCQs" value={`${mcqs.length} Questions`} foot="Scenarios & Technical Keys" />
          <Stat label="Exam Standard" value="80% Pass Gate" foot="CompTIA / CEH / OSCP" />
        </div>

        {/* Mission Briefing Card */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge tone="green">ACTIVE MISSION</Badge>
              <span>{metadata?.title || 'Loading Mission...'}</span>
            </div>
          }
          actions={
            metadata?.notebooklm_ref ? (
              <a
                href={metadata.notebooklm_ref}
                target="_blank"
                rel="noreferrer"
                className="btn sm ghost"
                style={{ textDecoration: 'none', color: '#00e5ff' }}
              >
                🔗 Open NotebookLM Source ↗
              </a>
            ) : null
          }
        >
          <p style={{ color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5, marginBottom: 12 }}>
            {metadata?.summary || 'Network Security Analysis, TCP 3-way handshakes, and port scanning internals.'}
          </p>
          {metadata?.key_concepts && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {metadata.key_concepts.map((concept: string, idx: number) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '0.75rem',
                    background: 'rgba(0, 229, 255, 0.08)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    color: '#00e5ff',
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}
                >
                  ✓ {concept}
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Navigation Tabs */}
        <div style={{ margin: '20px 0 16px 0' }}>
          <Tabs
            items={[
              { id: 'videos', label: '🎬 Dual Video Theater (16:9 & 9:16)' },
              { id: 'exam', label: `📝 Daily 20 MCQs Simulator (${answeredCount}/${mcqs.length})` },
              { id: 'roadmap', label: '🗺️ 90-Day Cybersecurity Roadmap' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* TAB 1: VIDEOS */}
        {activeTab === 'videos' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
            <Card
              title={
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`btn sm ${videoFormat === 'deepdive' ? 'primary' : 'ghost'}`}
                    onClick={() => setVideoFormat('deepdive')}
                  >
                    16:9 Deep Dive Tutorial (5-7 mins)
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${videoFormat === 'short' ? 'primary' : 'ghost'}`}
                    onClick={() => setVideoFormat('short')}
                  >
                    9:16 Social Reel / Short (60s)
                  </button>
                </div>
              }
              actions={
                <a
                  href={`/api/cybermaster/video?day=${day}&type=${videoFormat}`}
                  download
                  className="btn sm ghost"
                  style={{ textDecoration: 'none' }}
                >
                  ⬇ Download MP4
                </a>
              }
            >
              <div style={{ display: 'flex', justifyContent: 'center', background: '#000', borderRadius: 8, padding: 12 }}>
                {videoFormat === 'deepdive' ? (
                  <video
                    key={`deepdive-${day}`}
                    controls
                    preload="metadata"
                    style={{ width: '100%', maxWidth: 960, aspectRatio: '16/9', borderRadius: 6 }}
                  >
                    <source src={`/api/cybermaster/video?day=${day}&type=deepdive`} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <video
                    key={`short-${day}`}
                    controls
                    loop
                    preload="metadata"
                    style={{ width: '100%', maxWidth: 360, aspectRatio: '9/16', borderRadius: 6 }}
                  >
                    <source src={`/api/cybermaster/video?day=${day}&type=short`} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>
              <div style={{ marginTop: 12, fontSize: '0.85rem', color: '#94a3b8' }}>
                {videoFormat === 'deepdive'
                  ? '⚡ 16:9 Landscape Video: Full protocol theory, live hacker terminal syntax, Wireshark packet traces, and Blue Team detection rules.'
                  : '🔥 9:16 Vertical Reel: High-tempo short format optimized for TikTok / Reels with viral hook and actionable security rules.'}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: EXAM SIMULATOR */}
        {activeTab === 'exam' && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            {/* Sidebar Navigation */}
            <Card title="Exam Questions">
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Progress: <strong>{answeredCount}</strong> / {mcqs.length} Answered
                </span>
                <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.round((answeredCount / (mcqs.length || 1)) * 100)}%`,
                      height: '100%',
                      background: '#00ff88',
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              </div>

              {/* 1 to 20 Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
                {mcqs.map((q, idx) => {
                  const chosen = answers[String(q.id)];
                  let bg = '#1e293b';
                  let border = 'transparent';
                  let color = '#94a3b8';

                  if (idx === qIndex) {
                    border = '#00e5ff';
                    color = '#00e5ff';
                  }
                  if (chosen) {
                    if (submitted) {
                      const isRight = chosen.toUpperCase() === q.correct_answer.toUpperCase();
                      bg = isRight ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)';
                      color = '#fff';
                    } else {
                      bg = 'rgba(0,255,136,0.15)';
                      color = '#00ff88';
                    }
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQIndex(idx)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 6,
                        border: `1px solid ${border}`,
                        background: bg,
                        color,
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setInstantFeedback(!instantFeedback)}
                >
                  Instant Feedback: {instantFeedback ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={submitted}
                  onClick={handleSubmitExam}
                >
                  {submitted ? '✓ Exam Submitted' : 'Submit Exam'}
                </button>
              </div>
            </Card>

            {/* Question Viewport */}
            {currentQ ? (
              <Card
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span>QUESTION {String(qIndex + 1).padStart(2, '0')} OF {mcqs.length}</span>
                    {currentQ.mitre_technique && (
                      <span style={{ fontSize: '0.75rem', color: '#ffb300', background: 'rgba(255,179,0,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                        {currentQ.mitre_technique}
                      </span>
                    )}
                  </div>
                }
              >
                <p style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>
                  {currentQ.question}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {currentQ.options.map((opt) => {
                    const letter = opt.trim().charAt(0).toUpperCase();
                    const isSelected = answers[String(currentQ.id)] === letter;
                    const showCorrect = (submitted || (instantFeedback && answers[String(currentQ.id)])) && letter === currentQ.correct_answer.toUpperCase();
                    const showWrong = (submitted || (instantFeedback && answers[String(currentQ.id)])) && isSelected && letter !== currentQ.correct_answer.toUpperCase();

                    let bg = '#151f33';
                    let border = '#1e293b';
                    if (isSelected) {
                      bg = 'rgba(0,229,255,0.15)';
                      border = '#00e5ff';
                    }
                    if (showCorrect) {
                      bg = 'rgba(0,255,136,0.2)';
                      border = '#00ff88';
                    } else if (showWrong) {
                      bg = 'rgba(255,51,102,0.2)';
                      border = '#ff3366';
                    }

                    return (
                      <div
                        key={letter}
                        onClick={() => handleSelectOption(letter)}
                        style={{
                          padding: '14px 18px',
                          borderRadius: 8,
                          background: bg,
                          border: `1px solid ${border}`,
                          cursor: submitted ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: showCorrect ? '#00ff88' : showWrong ? '#ff3366' : '#00e5ff' }}>
                          {letter}
                        </span>
                        <span>{opt.slice(2).trim() || opt}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {(submitted || (instantFeedback && answers[String(currentQ.id)])) && (
                  <div
                    style={{
                      background: '#0b1320',
                      border: '1px solid #00e5ff',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ color: '#00e5ff', fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>
                      💡 TECHNICAL RATIONALE & EXAM ANALYSIS:
                    </div>
                    <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#f8fafc' }}>
                      {currentQ.explanation}
                    </p>
                  </div>
                )}

                {/* Pager */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={qIndex === 0}
                    onClick={() => setQIndex(qIndex - 1)}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={qIndex === mcqs.length - 1}
                    onClick={() => setQIndex(qIndex + 1)}
                  >
                    Next →
                  </button>
                </div>
              </Card>
            ) : (
              <Card title="No Questions Found">
                <p>Loading or generating questions...</p>
              </Card>
            )}

            {/* Score Result Overlay */}
            {scoreResult && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  background: scoreResult.passed ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                  border: `2px solid ${scoreResult.passed ? '#00ff88' : '#ff3366'}`,
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                <h3 style={{ fontSize: '1.8rem', color: scoreResult.passed ? '#00ff88' : '#ff3366', marginBottom: 6 }}>
                  {scoreResult.passed ? '🏆 CERTIFICATION PASSED' : 'REVISE & RETRY'}
                </h3>
                <p style={{ fontSize: '1.2rem', marginBottom: 8 }}>
                  Score: <strong>{scoreResult.pct}%</strong> ({scoreResult.correct} / {scoreResult.total} Correct)
                </p>
                <p style={{ color: '#94a3b8' }}>
                  {scoreResult.passed
                    ? 'Congratulations! You passed the 80% certification grade threshold. All protocol mechanics mastered.'
                    : 'Threshold is 80%. Review the highlighted explanations on each question and re-attempt.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ROADMAP */}
        {activeTab === 'roadmap' && (
          <Card title="90-Day Cybersecurity Mastery Curriculum">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {curriculum.map((item) => (
                <div
                  key={item.day}
                  style={{
                    background: item.day === day ? 'rgba(0,255,136,0.06)' : 'var(--card-dark, #0f172a)',
                    border: `1px solid ${item.day === day ? '#00ff88' : '#1e293b'}`,
                    borderRadius: 8,
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#00ff88', fontWeight: 700 }}>
                      DAY {String(item.day).padStart(2, '0')} // {item.category}
                    </span>
                    <h4 style={{ fontSize: '1.05rem', margin: '4px 0' }}>{item.title}</h4>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{item.summary}</p>
                  </div>
                  <button
                    type="button"
                    className={`btn sm ${item.day === day ? 'primary' : 'ghost'}`}
                    onClick={() => setDay(item.day)}
                  >
                    {item.day === day ? 'Active' : 'Switch'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
}
