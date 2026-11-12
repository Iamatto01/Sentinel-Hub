/**
 * Types for the Sentinel AI Multi-Agent Orchestrator,
 * Hindsight Cognitive Memory, and Jev Headless Browser.
 */

export type SubagentStatus = 'idle' | 'running' | 'completed' | 'failed';

export type MemoryCategory =
  | 'fact'
  | 'credential'
  | 'endpoint'
  | 'failure'
  | 'reflection'
  | 'selector';

export interface MemoryItem {
  id: string;
  entity: string;
  category: MemoryCategory;
  fact: string;
  confidence: number; // 0.0 - 1.0
  author: string; // e.g. "subagent-recon"
  createdAt: number;
  tags: string[];
}

export interface RecallOptions {
  query?: string;
  entity?: string;
  category?: MemoryCategory;
  tokenBudget?: number; // e.g. 1500 tokens (~6000 chars)
  limit?: number;
}

export interface BrowserElement {
  index: number;
  tagName: string;
  type?: string;
  text: string;
  name?: string;
  id?: string;
  placeholder?: string;
  href?: string;
}

export interface BrowserActionResult {
  success: boolean;
  action: string;
  currentUrl: string;
  pageTitle: string;
  elements: BrowserElement[];
  extractedText?: string;
  error?: string;
}

export interface SubagentSpec {
  id: string;
  role: string;
  task: string;
  model?: string;
  useBrowser?: boolean;
  targetUrl?: string;
}

export interface SubagentExecutionResult {
  id: string;
  role: string;
  task: string;
  status: SubagentStatus;
  output: string;
  browserActions?: BrowserActionResult[];
  memoriesRetained: number;
  executionTimeMs: number;
  error?: string;
}

export interface OrchestrationRunResult {
  runId: string;
  goal: string;
  status: 'completed' | 'partial_failure' | 'failed';
  totalSubagents: number;
  concurrencyLimit: number;
  durationMs: number;
  plan: SubagentSpec[];
  subagents: SubagentExecutionResult[];
  synthesis: string;
  memoriesCreated: number;
}

export interface OrchestratorStats {
  totalRuns: number;
  totalMemories: number;
  activeWorkers: number;
  lastRunAt?: number;
  categories: Record<MemoryCategory, number>;
}
