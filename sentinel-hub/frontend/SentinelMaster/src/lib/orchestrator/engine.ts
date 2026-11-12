import { randomUUID } from 'node:crypto';
import { routerOperatorChat } from '../router';
import { hindsight } from './memory';
import { JevBrowserSession } from './jev-browser';
import type {
  BrowserActionResult,
  OrchestrationRunResult,
  SubagentExecutionResult,
  SubagentSpec,
  SubagentStatus,
} from './types';

/**
 * Sentinel Swarm Engine: Simultaneous Multi-Agent Orchestrator
 * with Hindsight Memory and Jev Headless Browser.
 */

export interface RunOrchestrationOptions {
  goal: string;
  supervisorModel?: string;
  subagentModel?: string;
  concurrencyLimit?: number;
  useBrowser?: boolean;
}

export class SentinelOrchestratorEngine {
  private lastResult: OrchestrationRunResult | null = null;
  private running = false;

  public isBusy(): boolean {
    return this.running;
  }

  public getLastResult(): OrchestrationRunResult | null {
    return this.lastResult;
  }

  /**
   * Supervisor: Deconstructs the goal into parallel subtasks.
   */
  private async planSubtasks(
    goal: string,
    model: string,
    useBrowserDefault: boolean,
  ): Promise<SubagentSpec[]> {
    const memoryContext = (await hindsight.recall({ query: goal, tokenBudget: 800 })).formattedContext;

    const plannerPrompt = `
Objective: ${goal}

${memoryContext}

Task: You are the Lead Architect of the Sentinel AI Multi-Agent Swarm.
Decompose the objective into 2 to 4 specialized, parallelizable subtasks that can execute SIMULTANEOUSLY for speed and maximum coverage.
Specialist roles may include:
- Web Browser Auditor (navigates sites, inspects forms/auth, extracts data)
- Security & Endpoint Specialist (analyzes headers, API patterns, configs)
- Systems & Recon Analyst (verifies network surface, ports, logic)
- Intelligence & Synthesis Specialist

Respond ONLY with valid JSON in this exact structure:
[
  {
    "id": "agent-browser",
    "role": "Web Browser Auditor",
    "task": "Navigate to target and inspect DOM elements and forms",
    "useBrowser": true,
    "targetUrl": "https://example.com"
  },
  {
    "id": "agent-sec",
    "role": "Security Specialist",
    "task": "Evaluate attack surface and authentication defenses",
    "useBrowser": false
  }
]
`;

    try {
      const res = await routerOperatorChat({
        model,
        prompt: plannerPrompt,
        persona: 'You are the Master Planner for Sentinel simultaneous multi-agent execution.',
        maxTokens: 1024,
      });

      if (res.ok && res.content) {
        let clean = res.content.trim();
        if (clean.includes('```json')) {
          clean = clean.split('```json')[1].split('```')[0].trim();
        } else if (clean.includes('```')) {
          clean = clean.split('```')[1].split('```')[0].trim();
        }
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item, idx) => ({
            id: item.id || `subagent-${idx + 1}`,
            role: item.role || 'Specialist Worker',
            task: item.task || goal,
            useBrowser: item.useBrowser ?? useBrowserDefault,
            targetUrl: item.targetUrl,
          }));
        }
      }
    } catch (err) {
      console.warn('[Orchestrator] Fallback to default subagent plan:', err);
    }

    // Resilient fallback plan if LLM did not return strict JSON
    return [
      {
        id: 'subagent-primary',
        role: 'Primary Analyst',
        task: goal,
        useBrowser: useBrowserDefault,
      },
    ];
  }

  /**
   * Executes a single subagent:
   * 1. Recalls relevant Hindsight memory.
   * 2. (Optional) Drives Jev Headless Browser.
   * 3. Calls Sentinel Router for reasoning.
   * 4. Retains discovered facts into Hindsight memory.
   */
  private async executeSubagent(
    spec: SubagentSpec,
    goal: string,
    model: string,
  ): Promise<SubagentExecutionResult> {
    const start = Date.now();
    let status: SubagentStatus = 'running';
    let output = '';
    const browserActions: BrowserActionResult[] = [];
    let memoriesRetained = 0;

    try {
      // 1. RECALL: Check Hindsight Memory for past knowledge / credentials
      const memoryRecall = await hindsight.recall({
        query: `${spec.task} ${spec.targetUrl || ''}`,
        entity: spec.targetUrl,
        tokenBudget: 1000,
      });

      let browserContext = '';

      // 2. BROWSER: If subagent has browser duties, run Jev Ultrafast headless runner
      if (spec.useBrowser && spec.targetUrl) {
        const browser = new JevBrowserSession();
        const navResult = await browser.navigate(spec.targetUrl);
        browserActions.push(navResult);

        if (navResult.success) {
          const indexedElements = navResult.elements
            .slice(0, 25)
            .map((e) => `[${e.index}] <${e.tagName}> ${e.text} ${e.href ? `href=${e.href}` : ''}`)
            .join('\n');

          browserContext = `
Web Page Title: "${navResult.pageTitle}"
URL: ${navResult.currentUrl}
Indexed DOM Action Space:
${indexedElements}
Page Text Snippet:
${navResult.extractedText?.slice(0, 1500) || 'None'}
`;
        }
      }

      // 3. INFERENCE: Subagent executes task through Sentinel Router
      const agentPrompt = `
Primary Swarm Objective: ${goal}
Your Specific Assigned Task: ${spec.task}

${memoryRecall.formattedContext}

${browserContext ? `## LIVE HEADLESS BROWSER CONTEXT:\n${browserContext}` : ''}

Execution Instructions:
Execute your assigned subtask thoroughly. State your concrete observations, findings, and any discovered facts or credentials.
`;

      const inferenceRes = await routerOperatorChat({
        model: spec.model || model,
        prompt: agentPrompt,
        persona: `You are ${spec.role}, an autonomous subagent in the Sentinel AI Swarm.`,
        maxTokens: 1500,
      });

      if (!inferenceRes.ok) {
        throw new Error(inferenceRes.error || 'Subagent inference failed through Sentinel Router');
      }

      output = inferenceRes.content?.trim() || 'No output generated.';
      status = 'completed';

      // 4. RETAIN: Save new findings into Hindsight Shared Memory
      if (output.length > 40) {
        const entityName = spec.targetUrl || spec.id;
        await hindsight.retain({
          entity: entityName,
          fact: `[${spec.role}] ${output.slice(0, 300)}...`,
          category: spec.useBrowser ? 'endpoint' : 'fact',
          author: spec.id,
          confidence: 0.9,
          tags: [spec.id, spec.role.toLowerCase().replace(/\s+/g, '-')],
        });
        memoriesRetained++;
      }
    } catch (err: unknown) {
      status = 'failed';
      const msg = err instanceof Error ? err.message : String(err);
      output = `Error executing subagent: ${msg}`;

      // Retain failure into Hindsight so other subagents learn
      await hindsight.retain({
        entity: spec.targetUrl || spec.id,
        fact: `Execution failed: ${msg}`,
        category: 'failure',
        author: spec.id,
        confidence: 0.99,
        tags: ['error', 'failure', spec.id],
      });
      memoriesRetained++;
    }

    return {
      id: spec.id,
      role: spec.role,
      task: spec.task,
      status,
      output,
      browserActions: browserActions.length > 0 ? browserActions : undefined,
      memoriesRetained,
      executionTimeMs: Date.now() - start,
    };
  }

  /**
   * Main Orchestrator Run:
   * Plans -> Dispatches Subagents SIMULTANEOUSLY -> Synthesizes -> Reflects.
   */
  public async run(options: RunOrchestrationOptions): Promise<OrchestrationRunResult> {
    if (this.running) {
      throw new Error('An orchestration mission is already running.');
    }

    this.running = true;
    const runId = `run-${randomUUID().slice(0, 8)}`;
    const start = Date.now();
    const supervisorModel = options.supervisorModel || 'sentinel-flagship';
    const subagentModel = options.subagentModel || 'sentinel-flagship';
    const concurrency = Math.min(6, Math.max(1, options.concurrencyLimit ?? 4));

    try {
      // Step 1: Supervisor creates subagent plan
      const plan = await this.planSubtasks(options.goal, supervisorModel, Boolean(options.useBrowser));

      // Step 2: Concurrency Pool - Run subagents SIMULTANEOUSLY
      const subagentResults: SubagentExecutionResult[] = [];
      const queue = [...plan];

      const worker = async () => {
        while (queue.length > 0) {
          const spec = queue.shift();
          if (!spec) break;
          try {
            const res = await this.executeSubagent(spec, options.goal, subagentModel);
            subagentResults.push(res);
          } catch (workerErr: unknown) {
            // Catch-all so a worker can never become an orphaned rejection
            const msg = workerErr instanceof Error ? workerErr.message : String(workerErr);
            subagentResults.push({
              id: spec.id,
              role: spec.role,
              task: spec.task,
              status: 'failed',
              output: `Worker crashed: ${msg}`,
              memoriesRetained: 0,
              executionTimeMs: 0,
            });
          }
        }
      };

      // Launch up to `concurrency` workers simultaneously
      const workerPromises: Promise<void>[] = [];
      const activeWorkerCount = Math.min(concurrency, plan.length);
      for (let i = 0; i < activeWorkerCount; i++) {
        workerPromises.push(worker());
      }
      // allSettled ensures we wait for ALL workers even if one rejects
      await Promise.allSettled(workerPromises);

      // Step 3: Supervisor Synthesis
      const synthesisPrompt = `
Objective: ${options.goal}

The following subagents ran concurrently and produced these outputs:
${subagentResults.map((r) => `\n### [${r.role} - ID: ${r.id}] (${r.status.toUpperCase()} in ${r.executionTimeMs}ms)\n${r.output}\n`).join('\n')}

Synthesize an executive final report:
1. Executive Summary & Status
2. Critical Findings & Extracted Assets
3. Recommended Follow-ups & Next Actions
`;

      const synthesisRes = await routerOperatorChat({
        model: supervisorModel,
        prompt: synthesisPrompt,
        persona: 'You are the Sentinel Swarm Master Evaluator. Produce concise, high-signal, actionable reports.',
        maxTokens: 2048,
      });

      const synthesis = synthesisRes.ok && synthesisRes.content
        ? synthesisRes.content.trim()
        : 'Subagents completed execution. Review individual results above.';

      // Step 4: Background Reflection into Hindsight
      const totalMemories = subagentResults.reduce((sum, r) => sum + r.memoriesRetained, 0);
      try {
        await hindsight.reflect(options.goal.slice(0, 30), supervisorModel);
      } catch {
        // Reflection is soft
      }

      const allOk = subagentResults.every((r) => r.status === 'completed');
      const anyOk = subagentResults.some((r) => r.status === 'completed');

      const result: OrchestrationRunResult = {
        runId,
        goal: options.goal,
        status: allOk ? 'completed' : anyOk ? 'partial_failure' : 'failed',
        totalSubagents: subagentResults.length,
        concurrencyLimit: concurrency,
        durationMs: Date.now() - start,
        plan,
        subagents: subagentResults,
        synthesis,
        memoriesCreated: totalMemories,
      };

      this.lastResult = result;
      return result;
    } finally {
      this.running = false;
    }
  }
}

export const orchestratorEngine = new SentinelOrchestratorEngine();
