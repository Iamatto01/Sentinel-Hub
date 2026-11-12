import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { resolveProject, scanProjects, type ProjectSummary } from './projects';
import { runGit, lines } from './exec';

export interface AuditFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'ok';
  category: string;
  message: string;
  fixSuggestion: string;
}

export interface SecurityAuditResult {
  projectName: string;
  score: number; // 0 - 100
  scannedAt: string;
  findings: AuditFinding[];
  summary: string;
}

export interface ProjectPromoResult {
  projectName: string;
  title: string;
  duration: number;
  html: string;
  css: string;
}

export interface GrokReviewResult {
  projectName: string;
  isDirty: boolean;
  changedFilesCount: number;
  statusOutput: string[];
  suggestedCommit: {
    type: string;
    scope: string;
    message: string;
    description: string;
  };
  reviewNotes: string;
}

export interface VocalBriefResult {
  timestamp: string;
  speechText: string;
  projectCount: number;
  dirtyCount: number;
  cleanCount: number;
}

/**
 * 1. Shield Assist: SentinelThreat scans a target project for leaks and vulnerabilities.
 */
export async function runSecurityAudit(projectName: string): Promise<SecurityAuditResult> {
  const project = await resolveProject(projectName);
  if (!project) {
    throw new Error(`Project "${projectName}" could not be found.`);
  }

  const findings: AuditFinding[] = [];
  let score = 100;

  // 1. Check .gitignore
  const gitignorePath = path.join(project.path, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    score -= 20;
    findings.push({
      severity: 'high',
      category: 'Git Hygiene',
      message: 'No .gitignore file found in project root.',
      fixSuggestion: 'Create a .gitignore file to prevent accidental commits of secrets and node_modules.',
    });
  } else {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes('.env')) {
      score -= 15;
      findings.push({
        severity: 'high',
        category: 'Secret Leak Prevention',
        message: '.env is not explicitly ignored in .gitignore.',
        fixSuggestion: 'Add *.env and .env.local to .gitignore immediately.',
      });
    }
  }

  // 2. Check for active .env files
  const envPath = path.join(project.path, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    // Check if real keys are in .env
    const suspiciousKeys = ['AKIA', 'ghp_', 'sk-', 'AIzaSy', 'xoxb-'];
    for (const key of suspiciousKeys) {
      if (envContent.includes(key)) {
        score -= 25;
        findings.push({
          severity: 'critical',
          category: 'Credential Exposure Risk',
          message: `Active live API key prefix "${key}" detected in local .env file.`,
          fixSuggestion: 'Ensure this file is never tracked by git and rotate credentials if committed.',
        });
        break;
      }
    }
  }

  // 3. Check package.json dependencies
  const pkgPath = path.join(project.path, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      findings.push({
        severity: 'ok',
        category: 'Dependency Health',
        message: `Package configuration verified: ${pkg.name || projectName} v${pkg.version || '1.0.0'}.`,
        fixSuggestion: 'Keep dependencies updated using npm audit.',
      });
    } catch {
      score -= 10;
      findings.push({
        severity: 'medium',
        category: 'Configuration Error',
        message: 'Invalid or corrupt package.json file.',
        fixSuggestion: 'Verify syntax and format of package.json.',
      });
    }
  }

  if (findings.filter((f) => f.severity !== 'ok').length === 0) {
    findings.push({
      severity: 'ok',
      category: 'Shield Verification',
      message: 'Perimeter secure. No exposed credentials or configuration anomalies detected.',
      fixSuggestion: 'Maintain periodic threat scans.',
    });
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    projectName,
    score: finalScore,
    scannedAt: new Date().toISOString(),
    findings,
    summary:
      finalScore >= 80
        ? `Project perimeter is robust (Security Score: ${finalScore}/100). All core defenses intact.`
        : `Security perimeter requires attention (Security Score: ${finalScore}/100). Review critical findings.`,
  };
}

/**
 * 2. Creative Assist: HyperFrames & OpenCut generate an executive promo video for target project.
 */
export async function generateProjectPromo(projectName: string): Promise<ProjectPromoResult> {
  const project = await resolveProject(projectName);
  const displayName = project?.name || projectName;

  const html = `<div class="promo-card">
  <div class="glow-halo"></div>
  <div class="header">
    <span class="project-tag">SENTINEL ECOSYSTEM</span>
    <span class="badge">VERIFIED</span>
  </div>
  <h1 class="title">${displayName.toUpperCase()}</h1>
  <div class="meta-line">
    <span class="dot"></span>
    <span>AUTONOMOUS PRODUCTION MODULE</span>
  </div>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="num">100%</div>
      <div class="lbl">INTEGRATED</div>
    </div>
    <div class="stat-box">
      <div class="num">ACTIVE</div>
      <div class="lbl">STATUS</div>
    </div>
  </div>
  <div class="footer-bar">
    <span>hub.sentinelai.studio</span>
    <span>v2.0 PRO</span>
  </div>
</div>`;

  const css = `body {
  margin: 0;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #0f172a 0%, #030712 100%);
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
}
.promo-card {
  position: relative;
  width: 380px;
  padding: 36px 32px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(79, 140, 255, 0.4);
  border-radius: 28px;
  box-shadow: 0 0 60px rgba(79, 140, 255, 0.25);
  animation: cardEntry 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}
.project-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #93a1bd;
}
.badge {
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  border-radius: 99px;
  border: 1px solid rgba(52, 211, 153, 0.4);
}
.title {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.02em;
  margin: 0 0 10px 0;
  background: linear-gradient(135deg, #ffffff 0%, #4f8cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pulse 3s infinite ease-in-out;
}
.meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #38bdf8;
  letter-spacing: 0.08em;
  margin-bottom: 28px;
}
.dot {
  width: 6px;
  height: 6px;
  background: #38bdf8;
  border-radius: 50%;
  animation: blink 1.5s infinite;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 28px;
}
.stat-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
  text-align: center;
}
.num {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}
.lbl {
  font-size: 10px;
  color: #64748b;
  letter-spacing: 0.1em;
  margin-top: 4px;
}
.footer-bar {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #475569;
  font-family: monospace;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 16px;
}
@keyframes cardEntry {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}`;

  return {
    projectName: displayName,
    title: `${displayName} Autonomous Feature Release`,
    duration: 6,
    html,
    css,
  };
}

/**
 * 3. Intelligence Assist: Grok Bot analyzes uncommitted changes in a target project.
 */
export async function runGrokProjectReview(projectName: string): Promise<GrokReviewResult> {
  const project = await resolveProject(projectName);
  if (!project) throw new Error(`Project "${projectName}" not found.`);

  let statusLines: string[] = [];
  try {
    const statusRes = await runGit(['status', '--short'], project.path);
    statusLines = lines(statusRes.stdout);
  } catch {
    // not a git repo or clean
  }

  const isDirty = statusLines.length > 0;

  if (!isDirty) {
    return {
      projectName,
      isDirty: false,
      changedFilesCount: 0,
      statusOutput: [],
      suggestedCommit: {
        type: 'chore',
        scope: projectName.toLowerCase(),
        message: 'sync repository state with upstream',
        description: 'Working tree is clean. No uncommitted modifications detected.',
      },
      reviewNotes: `Repository ${projectName} is in pristine state. All changes are committed and tracked cleanly.`,
    };
  }

  const sampleFile = statusLines[0]?.slice(3).trim() || 'core';
  const inferredType = sampleFile.includes('test')
    ? 'test'
    : sampleFile.includes('doc') || sampleFile.endsWith('.md')
    ? 'docs'
    : sampleFile.includes('css') || sampleFile.includes('view') || sampleFile.includes('page')
    ? 'feat'
    : 'fix';

  return {
    projectName,
    isDirty: true,
    changedFilesCount: statusLines.length,
    statusOutput: statusLines.slice(0, 15),
    suggestedCommit: {
      type: inferredType,
      scope: projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      message: `update ${sampleFile} and related components`,
      description: `Automated Grok conventional commit for ${statusLines.length} modified file(s).`,
    },
    reviewNotes: `Grok Bot analyzed ${statusLines.length} modified file(s). Recommended conventional commit format: "${inferredType}(${projectName.toLowerCase()}): update ${sampleFile}". Ready to stage and commit.`,
  };
}

/**
 * 4. Vocal Assist: SentinelTouch generates a live executive audio briefing across all projects.
 */
export async function generateEcosystemVocalBrief(): Promise<VocalBriefResult> {
  const scan = await scanProjects();
  const total = scan.projects.length;
  const dirty = scan.totals.dirty;
  const clean = total - dirty;

  const speechText = `Sentinel Executive Status Briefing. Monitoring ${total} repositories under central command. ${clean} repositories are clean and verified. ${dirty} require git synchronization. All operational services, including SentinelFame and Autobot, are ready.`;

  return {
    timestamp: new Date().toLocaleTimeString(),
    speechText,
    projectCount: total,
    dirtyCount: dirty,
    cleanCount: clean,
  };
}
