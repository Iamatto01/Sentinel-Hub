'use client';

import { useState, useRef, useEffect } from 'react';
import type { GithubRepo } from '@/lib/github';
import type { LoopTask, LoopVerification, GeneratedFileChange, PublishResult } from '@/lib/github-loop';
import { apiPost } from './api';
import { Badge, Loading } from './ui';

interface GithubAiLoopModalProps {
  repo: GithubRepo;
  localProject?: string;
  onClose: () => void;
  onPublished?: (result: PublishResult) => void;
}

type ModalStage = 'input' | 'looping' | 'confirm' | 'published';

const PROMPT_PRESETS = [
  {
    icon: '🚀',
    title: 'Automated CI/CD Pipeline',
    prompt: 'Add GitHub Actions CI workflow (.github/workflows/ci.yml) to test, build, and lint on every push and PR.',
  },
  {
    icon: '🛡️',
    title: 'Security Hardening & Secret Guards',
    prompt: 'Audit and harden repository security: enforce strict .gitignore for credentials, add security headers, and prevent token leaks.',
  },
  {
    icon: '📝',
    title: 'Documentation & Architecture Guide',
    prompt: 'Create a comprehensive README.md with clear architecture overview, installation instructions, environment variables, and usage examples.',
  },
  {
    icon: '⚡',
    title: 'Refactor Error Handling & Logging',
    prompt: 'Refactor core API endpoints to include standardized error response formats, structured request logging, and defensive boundary guards.',
  },
  {
    icon: '🧪',
    title: 'Add Unit & Integration Tests',
    prompt: 'Add unit and integration test suites with mock coverage for core business logic and API routes.',
  },
];

const AVAILABLE_MODELS = [
  { id: 'antigravity/gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High (Fast & High Intelligence)' },
  { id: 'antigravity/gemini-3-flash', label: 'Gemini 3 Flash (Fast & Efficient)' },
  { id: 'auto/best-chat', label: 'OmniRoute Auto Flagship (Best Available)' },
  { id: 'kiro/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (Deep Reasoning)' },
];

export default function GithubAiLoopModal({ repo, localProject, onClose, onPublished }: GithubAiLoopModalProps) {
  const [stage, setStage] = useState<ModalStage>('input');
  const [objective, setObjective] = useState('');
  const [selectedModel, setSelectedModel] = useState('antigravity/gemini-3.8-flash-high');
  const [strategy, setStrategy] = useState('');
  const [tasks, setTasks] = useState<LoopTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(-1);
  const [allGeneratedFiles, setAllGeneratedFiles] = useState<GeneratedFileChange[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [verifications, setVerifications] = useState<LoopVerification[]>([]);
  const [currentIteration, setCurrentIteration] = useState(1);
  const [isLoopRunning, setIsLoopRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Commit and publish state
  const [commitMessage, setCommitMessage] = useState(`feat: implement automated agent updates for ${repo.name}`);
  const [branch, setBranch] = useState(repo.defaultBranch || 'main');
  const [createBranch, setCreateBranch] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const shouldCancelRef = useRef(false);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tasks, statusText, verifications]);

  // Clean exit
  const handleClose = () => {
    shouldCancelRef.current = true;
    onClose();
  };

  // Start the Autonomous AI Loop
  const handleStartLoop = async () => {
    if (!objective.trim()) return;
    setErrorMessage(null);
    setIsLoopRunning(true);
    setStage('looping');
    setStatusText('Analyzing repository and generating To-Do execution plan...');
    shouldCancelRef.current = false;

    try {
      // 1. Generate Plan
      const planRes = await apiPost<{
        tasks: LoopTask[];
        strategy: string;
        suggestedBranch: string;
        suggestedCommitMessage: string;
        modelUsed: string;
      }>('/api/github/loop', {
        action: 'plan',
        owner: repo.owner.login,
        name: repo.name,
        objective: objective.trim(),
        localProject,
        model: selectedModel,
      });

      if (!planRes.data?.tasks || planRes.data.tasks.length === 0) {
        throw new Error('AI could not generate a To-Do plan for this objective.');
      }

      const initialTasks = planRes.data.tasks;
      setStrategy(planRes.data.strategy || '');
      setCommitMessage(planRes.data.suggestedCommitMessage || `feat: update ${repo.name}`);
      if (planRes.data.suggestedBranch && planRes.data.suggestedBranch !== repo.defaultBranch) {
        setBranch(planRes.data.suggestedBranch);
        setCreateBranch(true);
      }
      setTasks(initialTasks);

      // 2. Run the Autonomous Loop
      await runExecutionLoop(initialTasks, 1, []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute loop');
      setIsLoopRunning(false);
    }
  };

  // Autonomous Execution & Verification Loop
  const runExecutionLoop = async (
    currentTaskList: LoopTask[],
    iterationNum: number,
    accumulatedFiles: GeneratedFileChange[],
  ) => {
    setCurrentIteration(iterationNum);
    let workingTasks = [...currentTaskList];
    let workingFiles = [...accumulatedFiles];

    // Execute pending tasks
    for (let i = 0; i < workingTasks.length; i++) {
      if (shouldCancelRef.current) return;
      const t = workingTasks[i];
      if (t.status === 'completed') continue;

      setCurrentTaskIndex(i);
      setStatusText(`Executing [Step ${i + 1}/${workingTasks.length}]: ${t.title}...`);

      // Mark running
      workingTasks[i] = { ...t, status: 'running' };
      setTasks([...workingTasks]);

      try {
        const stepRes = await apiPost<{
          output: string;
          files: GeneratedFileChange[];
          modelUsed: string;
        }>('/api/github/loop', {
          action: 'execute-step',
          owner: repo.owner.login,
          name: repo.name,
          objective: objective.trim(),
          task: t,
          completedTasks: workingTasks.filter((k) => k.status === 'completed'),
          existingFiles: workingFiles,
          localProject,
          model: selectedModel,
        });

        const newFiles = stepRes.data?.files || [];
        const stepOutput = stepRes.data?.output || 'Step completed.';

        // Merge files (overwriting matching paths)
        for (const nf of newFiles) {
          const existingIdx = workingFiles.findIndex((f) => f.path === nf.path);
          if (existingIdx >= 0) {
            workingFiles[existingIdx] = nf;
          } else {
            workingFiles.push(nf);
          }
        }

        workingTasks[i] = {
          ...workingTasks[i],
          status: 'completed',
          output: stepOutput,
          files: newFiles,
        };
        setTasks([...workingTasks]);
        setAllGeneratedFiles([...workingFiles]);
      } catch (err) {
        workingTasks[i] = {
          ...workingTasks[i],
          status: 'failed',
          error: err instanceof Error ? err.message : 'Step execution failed',
        };
        setTasks([...workingTasks]);
        throw err;
      }
    }

    if (shouldCancelRef.current) return;

    // 3. Verification & Satisfaction Check ("check again until all satisf")
    setStatusText(`Auditing & verifying solution satisfaction (Iteration ${iterationNum})...`);

    const verifyRes = await apiPost<LoopVerification>('/api/github/loop', {
      action: 'verify',
      owner: repo.owner.login,
      name: repo.name,
      objective: objective.trim(),
      completedTasks: workingTasks,
      files: workingFiles,
      iteration: iterationNum,
      model: selectedModel,
    });

    const verifyData = verifyRes.data || {
      satisfied: true,
      score: 100,
      iteration: iterationNum,
      feedback: 'Verification check passed successfully.',
      checkedAt: new Date().toISOString(),
    };

    setVerifications((prev) => [...prev, verifyData]);

    // Check if satisfied or if we need to iterate again
    const isSatisfied = verifyData.satisfied || verifyData.score >= 95 || iterationNum >= 3;

    if (!isSatisfied && verifyData.missingItems && verifyData.missingItems.length > 0) {
      setStatusText(`Verification score ${verifyData.score}%. Appending refinement tasks for Iteration ${iterationNum + 1}...`);

      const nextIterationTasks: LoopTask[] = verifyData.missingItems.map((item, idx) => ({
        id: `task-it${iterationNum + 1}-${idx + 1}`,
        title: item.title,
        description: item.description,
        type: item.type,
        status: 'pending',
        targetFiles: item.targetFiles || [],
        iteration: iterationNum + 1,
      }));

      const expandedTasks = [...workingTasks, ...nextIterationTasks];
      setTasks(expandedTasks);

      // Loop again!
      await runExecutionLoop(expandedTasks, iterationNum + 1, workingFiles);
    } else {
      // Satisfied! Advance to human confirmation stage
      setIsLoopRunning(false);
      setStatusText('All requirements satisfied! Moving to human confirmation...');
      setStage('confirm');
    }
  };

  // Publish to GitHub
  const handlePublish = async () => {
    if (!commitMessage.trim()) return;
    setIsPublishing(true);
    setErrorMessage(null);

    try {
      const res = await apiPost<PublishResult>('/api/github/loop', {
        action: 'publish',
        owner: repo.owner.login,
        name: repo.name,
        localProject,
        files: allGeneratedFiles,
        commitMessage: commitMessage.trim(),
        branch: branch.trim() || 'main',
        createBranch,
      });

      if (res.data) {
        setPublishResult(res.data);
        setStage('published');
        onPublished?.(res.data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const lastVerification = verifications[verifications.length - 1];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(192, 132, 252, 0.25))',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                  Sentinel AI GitHub Loop · {repo.fullName}
                </h3>
                {localProject && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 600,
                    }}
                  >
                    Local: {localProject}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                Autonomous Plan → Execute → Verify Loop → Human Confirmation Before Publishing
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Stage Indicator Badge */}
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '20px',
                background:
                  stage === 'input'
                    ? 'rgba(56, 189, 248, 0.15)'
                    : stage === 'looping'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : stage === 'confirm'
                        ? 'rgba(192, 132, 252, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)',
                color:
                  stage === 'input'
                    ? '#38bdf8'
                    : stage === 'looping'
                      ? '#eab308'
                      : stage === 'confirm'
                        ? '#c084fc'
                        : '#10b981',
                border: '1px solid currentColor',
              }}
            >
              {stage === 'input' && '1. Goal & Context'}
              {stage === 'looping' && `2. Autonomous Loop (It ${currentIteration})`}
              {stage === 'confirm' && '3. Confirm Before Publish'}
              {stage === 'published' && '4. Published to GitHub'}
            </span>

            <button
              type="button"
              className="btn sm ghost"
              onClick={handleClose}
              style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0 }}
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column' }}>
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setErrorMessage(null)}
                style={{ fontSize: '11px', padding: '2px 6px' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ===================== STAGE 1: INPUT OBJECTIVE ===================== */}
          {stage === 'input' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 650, marginBottom: '6px' }}>
                  What do you want to achieve with this repository?
                </label>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: 'var(--text-dim)' }}>
                  Describe your feature, refactor, security audit fix, or deployment target. The AI loop will plan the steps,
                  execute them, verify satisfaction, and ask for your confirmation before publishing.
                </p>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="e.g. Implement GitHub Actions CI/CD with test coverage and lint checks, or refactor API authentication with JWT refresh tokens..."
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  style={{ width: '100%', fontSize: '13.5px', lineHeight: '1.5', padding: '12px', resize: 'vertical' }}
                />
              </div>

              {/* Quick Prompt Presets */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '8px' }}>
                  Quick Goal Presets:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                  {PROMPT_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setObjective(p.prompt)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line-soft)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line-soft)')}
                    >
                      <span style={{ fontSize: '16px' }}>{p.icon}</span>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' }}>{p.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px', lineHeight: '1.3' }}>
                          {p.prompt.slice(0, 75)}...
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model & Settings Strip */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-dim)' }}>
                    Intelligence Model:
                  </label>
                  <select
                    className="input"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{ fontSize: '12.5px', padding: '4px 8px' }}
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  Max Verification Loops: <strong style={{ color: 'var(--text)' }}>3 Iterations</strong>
                </div>
              </div>

              {/* Launch Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={handleStartLoop}
                  disabled={!objective.trim() || isLoopRunning}
                  style={{
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: 650,
                    background: 'linear-gradient(135deg, #0284c7, #6366f1)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                    cursor: !objective.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  🚀 Generate To-Do Plan & Start AI Loop
                </button>
              </div>
            </div>
          )}

          {/* ===================== STAGE 2: LOOPING / EXECUTING ===================== */}
          {stage === 'looping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Progress Strip */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    {statusText || 'Executing autonomous steps...'}
                  </span>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    {progressPercent}% Complete ({completedCount}/{tasks.length})
                  </span>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: 'var(--line-soft)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Strategy Card */}
              {strategy && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    fontSize: '12.5px',
                    color: '#38bdf8',
                  }}
                >
                  <strong>Architectural Strategy:</strong> {strategy}
                </div>
              )}

              {/* Dynamic To-Do Checklist */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📋</span> Autonomous To-Do List ({tasks.length} items)
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tasks.map((t, idx) => {
                    const isCurrent = idx === currentTaskIndex;
                    return (
                      <div
                        key={t.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '10px',
                          background: isCurrent ? 'rgba(56, 189, 248, 0.08)' : 'var(--panel-2)',
                          border: isCurrent ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--line-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '16px' }}>
                              {t.status === 'completed' && '✅'}
                              {t.status === 'running' && '⚡'}
                              {t.status === 'pending' && '⏳'}
                              {t.status === 'failed' && '❌'}
                            </span>
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>
                                {t.title}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                {t.description}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {t.iteration && t.iteration > 1 && (
                              <Badge tone="violet">Iteration {t.iteration}</Badge>
                            )}
                            <Badge tone={t.type === 'code' ? 'blue' : t.type === 'security' ? 'amber' : t.type === 'test' ? 'green' : 'grey'}>
                              {t.type.toUpperCase()}
                            </Badge>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color:
                                  t.status === 'completed'
                                    ? '#10b981'
                                    : t.status === 'running'
                                      ? '#38bdf8'
                                      : t.status === 'failed'
                                        ? '#ef4444'
                                        : 'var(--text-faint)',
                              }}
                            >
                              {t.status}
                            </span>
                          </div>
                        </div>

                        {/* Target file indicators */}
                        {t.targetFiles && t.targetFiles.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Target:</span>
                            {t.targetFiles.map((tf, i) => (
                              <code
                                key={i}
                                style={{
                                  fontSize: '11px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'var(--panel)',
                                  border: '1px solid var(--line)',
                                }}
                              >
                                {tf}
                              </code>
                            ))}
                          </div>
                        )}

                        {/* Step output summary if done */}
                        {t.output && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: 'var(--panel)',
                              fontSize: '12px',
                              color: 'var(--text-dim)',
                              borderLeft: '2px solid #38bdf8',
                            }}
                          >
                            {t.output}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Verifications History */}
              {verifications.length > 0 && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🛡️</span> AI Verification & Satisfaction Audits ({verifications.length})
                  </h4>
                  {verifications.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'var(--panel)',
                        border: '1px solid var(--line-soft)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong>Iteration {v.iteration} Audit</strong>
                        <span style={{ color: v.score >= 95 ? '#10b981' : '#eab308', fontWeight: 700 }}>
                          Satisfaction: {v.score}%
                        </span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-dim)' }}>{v.feedback}</p>
                    </div>
                  ))}
                </div>
              )}

              <div ref={logsEndRef} />
            </div>
          )}

          {/* ===================== STAGE 3: CONFIRM BEFORE PUBLISHING ===================== */}
          {stage === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Satisfaction Banner */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      color: '#10b981',
                    }}
                  >
                    ✓
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#10b981' }}>
                      All Objectives Satisfied & Verified (Score: {lastVerification?.score ?? 100}%)
                    </h4>
                    <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--text-dim)' }}>
                      The AI loop completed {tasks.length} tasks across {currentIteration} iteration(s).
                      Please review all generated files and confirm below before publishing to GitHub.
                    </p>
                  </div>
                </div>

                <Badge tone="green">READY TO PUBLISH</Badge>
              </div>

              {/* Code Changes Inspector */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 650 }}>
                    Generated / Modified Files ({allGeneratedFiles.length}):
                  </label>
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    Click any file to inspect full source code
                  </span>
                </div>

                {/* File Tabs */}
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {allGeneratedFiles.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedFileIndex(idx)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: selectedFileIndex === idx ? 'var(--panel-2)' : 'transparent',
                        border: selectedFileIndex === idx ? '1px solid #38bdf8' : '1px solid var(--line-soft)',
                        color: selectedFileIndex === idx ? '#38bdf8' : 'var(--text)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontSize: '10px', color: f.action === 'create' ? '#10b981' : '#f59e0b' }}>
                        {f.action === 'create' ? '+' : '~'}
                      </span>
                      {f.path}
                    </button>
                  ))}
                </div>

                {/* Code Viewer */}
                {allGeneratedFiles[selectedFileIndex] && (
                  <div
                    style={{
                      marginTop: '8px',
                      borderRadius: '10px',
                      background: '#0d1117',
                      border: '1px solid var(--line)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--mono)', color: '#38bdf8' }}>
                        {allGeneratedFiles[selectedFileIndex].path} ({allGeneratedFiles[selectedFileIndex].action})
                      </span>
                      <span style={{ color: 'var(--text-dim)' }}>
                        {allGeneratedFiles[selectedFileIndex].summary}
                      </span>
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: '14px',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        fontSize: '12px',
                        fontFamily: 'var(--mono)',
                        lineHeight: '1.5',
                        color: '#e6edf3',
                        background: '#0d1117',
                      }}
                    >
                      <code>{allGeneratedFiles[selectedFileIndex].content}</code>
                    </pre>
                  </div>
                )}
              </div>

              {/* Commit & Branch Details */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 650 }}>
                  Publish & Commit Settings
                </h4>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                    Commit Message:
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    style={{ width: '100%', fontSize: '13px', fontFamily: 'var(--mono)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                      Target Branch:
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      style={{ width: '100%', fontSize: '13px', fontFamily: 'var(--mono)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '18px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={createBranch}
                        onChange={(e) => setCreateBranch(e.target.checked)}
                      />
                      Create as new feature branch
                    </label>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  {localProject ? (
                    <span>
                      Target: Local server workspace <strong>{localProject}</strong> (will write files, commit locally, and git push to origin).
                    </span>
                  ) : (
                    <span>
                      Target: GitHub cloud repository <strong>{repo.fullName}</strong> (will commit files via GitHub REST API).
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => setStage('input')}
                  disabled={isPublishing}
                >
                  ← Edit Objective / Iterate More
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={handleClose}
                    disabled={isPublishing}
                  >
                    Discard Changes
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={handlePublish}
                    disabled={isPublishing || !commitMessage.trim()}
                    style={{
                      padding: '9px 22px',
                      fontSize: '13.5px',
                      fontWeight: 650,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                      cursor: isPublishing ? 'wait' : 'pointer',
                    }}
                  >
                    {isPublishing ? <span className="spinner" /> : '🚀'} Confirm & Publish to GitHub
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================== STAGE 4: PUBLISHED OUTCOME ===================== */}
          {stage === 'published' && publishResult && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '30px 20px',
                gap: '18px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '2px solid #10b981',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                }}
              >
                ✓
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                  Successfully Published to GitHub!
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-dim)', maxWidth: '500px' }}>
                  {publishResult.message}
                </p>
              </div>

              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  gap: '24px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Branch: </span>
                  <strong style={{ fontFamily: 'var(--mono)' }}>{publishResult.branch}</strong>
                </div>
                {publishResult.commitHash && (
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Commit: </span>
                    <strong style={{ fontFamily: 'var(--mono)' }}>{publishResult.commitHash.slice(0, 8)}</strong>
                  </div>
                )}
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Files Published: </span>
                  <strong>{publishResult.publishedFiles.length}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                {publishResult.url && (
                  <a
                    href={publishResult.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn"
                    style={{
                      padding: '8px 18px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                    }}
                  >
                    View on GitHub ↗
                  </a>
                )}

                <button
                  type="button"
                  className="btn"
                  onClick={handleClose}
                  style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600 }}
                >
                  Done & Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
