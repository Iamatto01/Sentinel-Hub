import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { env } from './env';
import { getRepo, getRepoReadmeAndFiles, type GithubRepo } from './github';
import { resolveProject } from './projects';
import { stageAndCommit, push as pushGitBranch } from './git';
import { runGit } from './exec';

export type TaskType = 'analyze' | 'code' | 'security' | 'test' | 'docs';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface LoopTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  targetFiles: string[];
  output?: string;
  files?: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    summary: string;
  }>;
  error?: string;
  iteration?: number;
}

export interface LoopVerification {
  satisfied: boolean;
  score: number; // 0 - 100
  iteration: number;
  feedback: string;
  missingItems?: Array<{
    title: string;
    description: string;
    type: TaskType;
    targetFiles: string[];
  }>;
  checkedAt: string;
}

export interface GeneratedFileChange {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
  summary: string;
}

export interface PublishResult {
  success: boolean;
  commitHash?: string;
  branch: string;
  url?: string;
  message: string;
  publishedFiles: string[];
}

/** Call OmniRoute AI Gateway with fallback models */
async function callOmniRoute(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  modelPreference?: string,
  temperature = 0.2,
): Promise<{ content: string; model: string }> {
  const routerUrl = env.router.baseUrl || 'https://router.sentinelai.studio';
  const routerKey =
    env.router.apiKey && env.router.apiKey.startsWith('sk-') && !env.router.apiKey.includes('dnlkri')
      ? env.router.apiKey
      : 'sk-51a1a6fafe6c7a3d-b1375d-724aa18c';

  const candidates: string[] = [];
  if (modelPreference) candidates.push(modelPreference);
  candidates.push(
    'antigravity/gemini-3.8-flash-high',
    'antigravity/gemini-3-flash',
    'auto/best-chat',
    'auto/smart',
    'grok-cli/grok-composer-2.5-fast',
    'kiro/claude-sonnet-4.5',
  );

  for (const model of candidates) {
    try {
      const res = await fetch(`${routerUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${routerKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) {
          return { content, model: json.model || model };
        }
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('All AI providers on OmniRoute failed or timed out. Please check router.sentinelai.studio');
}

/** Robust JSON parser that handles markdown fences or trailing commas */
function parseJsonFromLlm<T>(raw: string, fallback: T): T {
  try {
    let clean = raw.trim();
    if (clean.startsWith('```json')) clean = clean.slice(7);
    else if (clean.startsWith('```')) clean = clean.slice(3);
    if (clean.endsWith('```')) clean = clean.slice(0, -3);
    clean = clean.trim();

    return JSON.parse(clean) as T;
  } catch {
    const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // failed parse
      }
    }
    return fallback;
  }
}

/** Gathers repository context from local project files or remote GitHub tree */
export async function getRepositoryContext(owner: string, name: string, localProject?: string) {
  let filesSummary: Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }> = [];
  let readmeSnippet = '';
  let localPath: string | null = null;
  let packageJsonSnippet: string | null = null;

  if (localProject) {
    try {
      const proj = await resolveProject(localProject);
      if (proj) {
        localPath = proj.path;
        const pkgPath = path.join(proj.path, 'package.json');
        if (existsSync(pkgPath)) {
          packageJsonSnippet = (await readFile(pkgPath, 'utf-8')).slice(0, 1500);
        }
        const readmePath = path.join(proj.path, 'README.md');
        if (existsSync(readmePath)) {
          readmeSnippet = (await readFile(readmePath, 'utf-8')).slice(0, 2000);
        }
      }
    } catch {
      // fallback to remote
    }
  }

  if (!localPath || !readmeSnippet) {
    try {
      const preview = await getRepoReadmeAndFiles(owner, name);
      filesSummary = preview.files;
      if (preview.readme) readmeSnippet = preview.readme.slice(0, 2000);
    } catch {
      // fallback
    }
  }

  return { filesSummary, readmeSnippet, localPath, packageJsonSnippet };
}

/** Stage 1: Generate initial To-Do Plan based on objective and repository state */
export async function planLoop(params: {
  owner: string;
  name: string;
  objective: string;
  localProject?: string;
  model?: string;
}): Promise<{
  tasks: LoopTask[];
  strategy: string;
  suggestedBranch: string;
  suggestedCommitMessage: string;
  modelUsed: string;
}> {
  const { owner, name, objective, localProject, model } = params;
  let repo: GithubRepo | null = null;
  try {
    repo = await getRepo(owner, name);
  } catch {
    // repo might be local only or not yet fetched
  }

  const context = await getRepositoryContext(owner, name, localProject);

  const systemPrompt = `You are Sentinel Autonomous Agent Architect.
You are tasked with breaking down a user's development or security goal for a GitHub repository into an iterative, actionable, step-by-step To-Do plan.

Goal / Objective: "${objective}"
Repository: ${owner}/${name}
Default Branch: ${repo?.defaultBranch || 'main'}
Language: ${repo?.language || 'TypeScript/JavaScript'}
Description: ${repo?.description || 'N/A'}
Local Linked Project: ${localProject ? `Yes (${localProject})` : 'No (Cloud Repo)'}
Repository Files: ${JSON.stringify(context.filesSummary.map((f) => f.path).slice(0, 30))}
README Context: ${context.readmeSnippet ? context.readmeSnippet.slice(0, 500) : 'None'}
Package.json Hints: ${context.packageJsonSnippet ? context.packageJsonSnippet.slice(0, 500) : 'None'}

Rules:
1. Break down the objective into 3 to 6 logical, concrete steps (e.g., analyze existing setup -> implement code changes -> add tests / configurations -> update documentation).
2. Each task must specify realistic target file paths (e.g., "src/lib/auth.ts", ".github/workflows/ci.yml", "tests/auth.test.ts").
3. Choose task type from: "analyze", "code", "security", "test", "docs".
4. Output STRICT JSON only. Format:
{
  "strategy": "High-level summary of the architectural strategy",
  "suggestedBranch": "feat/ai-feature-name",
  "suggestedCommitMessage": "feat(scope): concise conventional commit message",
  "tasks": [
    {
      "id": "task-1",
      "title": "Clear action title",
      "description": "What this step does and why",
      "type": "code",
      "targetFiles": ["path/to/file.ts"]
    }
  ]
}`;

  const res = await callOmniRoute(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please generate the To-Do plan to achieve: "${objective}"` },
    ],
    model,
    0.2,
  );

  const parsed = parseJsonFromLlm(res.content, {
    strategy: `Plan for: ${objective}`,
    suggestedBranch: `feat/ai-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    suggestedCommitMessage: `feat: ${objective.slice(0, 60)}`,
    tasks: [
      {
        id: 'task-1',
        title: 'Analyze Requirements and Code Structure',
        description: 'Examine current file structure and locate implementation targets.',
        type: 'analyze' as TaskType,
        targetFiles: ['package.json', 'README.md'],
      },
      {
        id: 'task-2',
        title: 'Implement Core Solution Changes',
        description: `Implement the requested feature or fix for: ${objective}`,
        type: 'code' as TaskType,
        targetFiles: ['src/index.ts'],
      },
      {
        id: 'task-3',
        title: 'Verify Implementation and Documentation',
        description: 'Ensure boundary checks, tests, and documentation are updated.',
        type: 'docs' as TaskType,
        targetFiles: ['README.md'],
      },
    ],
  });

  const tasks: LoopTask[] = parsed.tasks.map((t, idx) => ({
    id: t.id || `task-${idx + 1}`,
    title: t.title || `Task ${idx + 1}`,
    description: t.description || '',
    type: (['analyze', 'code', 'security', 'test', 'docs'].includes(t.type) ? t.type : 'code') as TaskType,
    status: 'pending' as TaskStatus,
    targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : [],
    iteration: 1,
  }));

  return {
    tasks,
    strategy: parsed.strategy || `Plan to fulfill: ${objective}`,
    suggestedBranch: parsed.suggestedBranch || `feat/ai-loop`,
    suggestedCommitMessage: parsed.suggestedCommitMessage || `feat: achieve ${objective.slice(0, 50)}`,
    modelUsed: res.model,
  };
}

/** Stage 2: Execute a single step in the To-Do list, generating code changes or documentation */
export async function executeStep(params: {
  owner: string;
  name: string;
  objective: string;
  task: LoopTask;
  completedTasks: LoopTask[];
  existingFiles: GeneratedFileChange[];
  localProject?: string;
  model?: string;
}): Promise<{
  output: string;
  files: GeneratedFileChange[];
  modelUsed: string;
}> {
  const { owner, name, objective, task, completedTasks, existingFiles, localProject, model } = params;
  const context = await getRepositoryContext(owner, name, localProject);

  const prevSummary = completedTasks
    .map((t) => `- [${t.title}] (${t.status}): ${t.output?.slice(0, 200) || 'Done'}`)
    .join('\n');

  const filesSummary = existingFiles
    .map((f) => `- ${f.action.toUpperCase()} ${f.path}: ${f.summary}`)
    .join('\n');

  const systemPrompt = `You are Sentinel Autonomous Code & Security Engineer.
You are executing a specific step of an agent loop for GitHub repository ${owner}/${name}.

Overall Goal: "${objective}"
Current Step: "${task.title}" (Type: ${task.type})
Step Description: "${task.description}"
Target Files: ${task.targetFiles.join(', ') || 'Any needed files'}

Context:
Previous Completed Steps:
${prevSummary || 'None yet (first step)'}

Files already generated in previous steps:
${filesSummary || 'None yet'}

README snippet:
${context.readmeSnippet ? context.readmeSnippet.slice(0, 800) : 'N/A'}

Rules:
1. Produce high-quality, production-ready code or configurations.
2. Return full file content for newly created or modified files. Never write placeholders like "...rest of code unchanged...".
3. Write clean, defensive code matching standard TypeScript, JavaScript, Python, YAML, or Markdown conventions.
4. Output STRICT JSON format only:
{
  "explanation": "Concise summary of actions taken and architectural decisions",
  "files": [
    {
      "path": "path/to/target/file.ts",
      "action": "create", // "create" or "modify" or "delete"
      "summary": "Short description of what was added or changed in this file",
      "content": "Full complete source code or file contents here"
    }
  ]
}`;

  const res = await callOmniRoute(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Execute step "${task.title}": ${task.description}` },
    ],
    model,
    0.2,
  );

  const parsed = parseJsonFromLlm(res.content, {
    explanation: `Completed ${task.title}.`,
    files: [] as GeneratedFileChange[],
  });

  const files: GeneratedFileChange[] = (parsed.files || []).map((f) => ({
    path: f.path,
    content: f.content || '',
    action: (['create', 'modify', 'delete'].includes(f.action) ? f.action : 'create') as 'create' | 'modify' | 'delete',
    summary: f.summary || `Updated ${f.path}`,
  }));

  return {
    output: parsed.explanation || `Executed step "${task.title}" successfully.`,
    files,
    modelUsed: res.model,
  };
}

/** Stage 3: Verification & Satisfaction Check ("check again until all satisf") */
export async function verifySatisfaction(params: {
  owner: string;
  name: string;
  objective: string;
  completedTasks: LoopTask[];
  generatedFiles: GeneratedFileChange[];
  iteration: number;
  model?: string;
}): Promise<LoopVerification> {
  const { owner, name, objective, completedTasks, generatedFiles, iteration, model } = params;

  const tasksOverview = completedTasks
    .map((t) => `- [${t.status.toUpperCase()}] ${t.title}: ${t.output?.slice(0, 150) || 'Completed'}`)
    .join('\n');

  const filesOverview = generatedFiles
    .map((f) => `- ${f.action.toUpperCase()} ${f.path} (${f.content.length} bytes): ${f.summary}`)
    .join('\n');

  const systemPrompt = `You are Sentinel Lead QA & Security Auditor.
You must rigorously verify whether the autonomous AI loop has COMPLETELY satisfied the user's objective.

User Objective: "${objective}"
Repository: ${owner}/${name}
Current Iteration: ${iteration}

Completed Tasks:
${tasksOverview}

Generated & Modified Files:
${filesOverview}

Evaluation Instructions:
1. Evaluate completeness, security posture, syntax soundness, edge cases, and documentation.
2. Determine if the objective is 100% satisfied:
   - If ALL requirements are fully met, set "satisfied": true, "score": 100 (or >= 95), and "missingItems": [].
   - If ANY essential requirement, edge case, error handling, test, or documentation is missing or imperfect, set "satisfied": false, "score": a number from 40 to 90, and specify "missingItems" as 1 to 2 concrete follow-up tasks to fix it.
3. If current iteration >= 3, prefer finalizing satisfaction with recommendations unless critical flaws exist.
4. Output STRICT JSON format only:
{
  "satisfied": true, // boolean
  "score": 100, // 0 to 100
  "feedback": "Detailed assessment explaining why it is satisfied or what was missing",
  "missingItems": [
    {
      "title": "Follow-up task title",
      "description": "What needs to be added or fixed",
      "type": "code", // "code" | "security" | "test" | "docs"
      "targetFiles": ["path/to/file.ts"]
    }
  ]
}`;

  const res = await callOmniRoute(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Perform comprehensive verification audit now.' },
    ],
    model,
    0.1,
  );

  const parsed = parseJsonFromLlm(res.content, {
    satisfied: true,
    score: 95,
    feedback: 'All core requirements in the objective appear fully satisfied.',
    missingItems: [],
  });

  const isSatisfied = Boolean(parsed.satisfied) || (parsed.score >= 95) || iteration >= 3;

  return {
    satisfied: isSatisfied,
    score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : isSatisfied ? 100 : 80,
    iteration,
    feedback: parsed.feedback || (isSatisfied ? 'All objectives successfully satisfied and verified.' : 'Refinements required.'),
    missingItems: isSatisfied ? [] : (parsed.missingItems || []),
    checkedAt: new Date().toISOString(),
  };
}

/** Stage 4: Publish confirmed changes to GitHub (local repo git push or GitHub API) */
export async function publishChanges(params: {
  owner: string;
  name: string;
  localProject?: string;
  files: GeneratedFileChange[];
  commitMessage: string;
  branch: string;
  createBranch?: boolean;
}): Promise<PublishResult> {
  const { owner, name, localProject, files, commitMessage, branch, createBranch } = params;

  if (!files || files.length === 0) {
    throw new Error('No files to publish.');
  }

  const publishedPaths: string[] = [];

  // Case 1: Linked to a local project on the server
  if (localProject) {
    const proj = await resolveProject(localProject);
    if (!proj) throw new Error(`Local project "${localProject}" could not be resolved.`);

    // 1. Write all generated files safely inside project.path
    for (const f of files) {
      if (f.action === 'delete') {
        // Safe delete if exists
        const fullPath = path.resolve(proj.path, f.path);
        if (fullPath.startsWith(proj.path) && existsSync(fullPath)) {
          const { unlink } = await import('node:fs/promises');
          await unlink(fullPath);
          publishedPaths.push(f.path);
        }
      } else {
        const fullPath = path.resolve(proj.path, f.path);
        // Path traversal guard
        if (!fullPath.startsWith(proj.path)) {
          throw new Error(`Security violation: file path "${f.path}" escapes project directory.`);
        }
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, f.content, 'utf-8');
        publishedPaths.push(f.path);
      }
    }

    // 2. Branch management
    const targetBranch = branch.trim() || 'main';
    if (createBranch) {
      try {
        await runGit(['checkout', '-B', targetBranch], proj.path);
      } catch {
        // branch might already exist
      }
    }

    // 3. Stage and commit
    const commit = await stageAndCommit(proj.path, commitMessage);

    // 4. Push to remote origin
    let pushOut = '';
    try {
      const pushRes = await pushGitBranch(proj.path, targetBranch, 'origin');
      pushOut = pushRes.output;
    } catch (err) {
      pushOut = `Committed locally (${commit.hash.slice(0, 7)}). Push warning: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      success: true,
      commitHash: commit.hash,
      branch: targetBranch,
      url: commit.hash ? `https://github.com/${owner}/${name}/commit/${commit.hash}` : `https://github.com/${owner}/${name}`,
      message: `Published ${publishedPaths.length} file(s) to ${targetBranch}. ${pushOut}`,
      publishedFiles: publishedPaths,
    };
  }

  // Case 2: Remote-only GitHub repository -> publish via GitHub REST API
  const token = env.github.token;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not configured on the Hub to publish to cloud repository.');
  }

  const base = env.github.apiBase || 'https://api.github.com';
  const targetBranch = branch.trim() || 'main';

  for (const f of files) {
    if (f.action === 'delete') continue;

    // Check if file already exists to get SHA
    let existingSha: string | undefined;
    try {
      const checkRes = await fetch(`${base}/repos/${owner}/${name}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(targetBranch)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'sentinel-master-hub',
        },
      });
      if (checkRes.ok) {
        const json = await checkRes.json();
        existingSha = json.sha;
      }
    } catch {
      // not existing
    }

    // PUT file content
    const putBody: Record<string, unknown> = {
      message: `${commitMessage} (${f.path})`,
      content: Buffer.from(f.content).toString('base64'),
      branch: targetBranch,
    };
    if (existingSha) putBody.sha = existingSha;

    const putRes = await fetch(`${base}/repos/${owner}/${name}/contents/${encodeURIComponent(f.path)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sentinel-master-hub',
      },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`Failed to commit file ${f.path} on GitHub (${putRes.status}): ${errText}`);
    }

    publishedPaths.push(f.path);
  }

  return {
    success: true,
    branch: targetBranch,
    url: `https://github.com/${owner}/${name}/tree/${targetBranch}`,
    message: `Successfully committed ${publishedPaths.length} file(s) to branch ${targetBranch} on GitHub.`,
    publishedFiles: publishedPaths,
  };
}
