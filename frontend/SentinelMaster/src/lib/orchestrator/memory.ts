import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { routerOperatorChat } from '../router';
import type { MemoryCategory, MemoryItem, RecallOptions } from './types';

/**
 * Hindsight Cognitive Shared Memory Architecture for Sentinel Swarms.
 *
 * Implements:
 * 1. RETAIN: Durable structured facts, credentials, and failure logs.
 * 2. RECALL: 4-way hybrid retrieval (Entity, Token similarity, Recency, Confidence)
 *            strictly bounded by a token budget to protect LLM context windows.
 * 3. REFLECT: Background synthesis of past failures and experiences into updated
 *             rules/mental models via Sentinel Router.
 *
 * Storage: `.sentinel-state/hindsight_memory.json` — local Hub state only, never
 * replaces or touches the authoritative `fyp2.db` database.
 */

const STATE_DIR = path.join(process.cwd(), '.sentinel-state');
const MEMORY_FILE = path.join(STATE_DIR, 'hindsight_memory.json');

// Approx 4 characters per token
const CHARS_PER_TOKEN = 4;
const DEFAULT_TOKEN_BUDGET = 1500;

/** Hard cap to prevent unbounded growth. Evicts oldest low-confidence items when exceeded. */
const MAX_MEMORY_ITEMS = 500;

class HindsightStore {
  private items: Map<string, MemoryItem> = new Map();
  private initialized = false;
  private saving = false;

  private async ensureLoaded(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (!existsSync(STATE_DIR)) {
        await mkdir(STATE_DIR, { recursive: true });
      }
      if (existsSync(MEMORY_FILE)) {
        const raw = await readFile(MEMORY_FILE, 'utf-8');
        const list: MemoryItem[] = JSON.parse(raw);
        for (const item of list) {
          this.items.set(item.id, item);
        }
      }
    } catch (err) {
      console.warn('[Hindsight] Could not load stored memory, starting empty:', err);
    }
  }

  /** Async write with temp-file atomic pattern to prevent corruption. */
  private async save(): Promise<void> {
    if (this.saving) return; // coalesce rapid writes
    this.saving = true;

    // Yield to event loop before writing
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      if (!existsSync(STATE_DIR)) {
        await mkdir(STATE_DIR, { recursive: true });
      }
      const list = Array.from(this.items.values());
      const tmpPath = `${MEMORY_FILE}.tmp`;
      await writeFile(tmpPath, JSON.stringify(list, null, 2), 'utf-8');

      // Atomic rename (on same filesystem this is safe)
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, MEMORY_FILE);
    } catch (err) {
      console.error('[Hindsight] Failed to save memory store:', err);
    } finally {
      this.saving = false;
    }
  }

  /**
   * Evicts oldest, lowest-confidence items to stay under MAX_MEMORY_ITEMS.
   */
  private evictIfNeeded(): void {
    if (this.items.size <= MAX_MEMORY_ITEMS) return;

    const sorted = Array.from(this.items.values()).sort((a, b) => {
      // Reflections are protected from eviction
      if (a.category === 'reflection' && b.category !== 'reflection') return 1;
      if (b.category === 'reflection' && a.category !== 'reflection') return -1;
      // Lowest confidence first, then oldest first
      const confDiff = a.confidence - b.confidence;
      if (Math.abs(confDiff) > 0.05) return confDiff;
      return a.createdAt - b.createdAt;
    });

    const toEvict = sorted.slice(0, this.items.size - MAX_MEMORY_ITEMS);
    for (const item of toEvict) {
      this.items.delete(item.id);
    }
  }

  /**
   * RETAIN: Stores a new fact or experience into collective memory.
   */
  public async retain(params: {
    entity: string;
    fact: string;
    category?: MemoryCategory;
    author?: string;
    confidence?: number;
    tags?: string[];
  }): Promise<MemoryItem> {
    await this.ensureLoaded();

    const entityClean = params.entity.trim();
    const factClean = params.fact.trim();
    if (!factClean) {
      throw new Error('Memory fact cannot be empty.');
    }

    // Check for exact duplicate under same entity
    for (const existing of this.items.values()) {
      if (
        existing.entity.toLowerCase() === entityClean.toLowerCase() &&
        existing.fact.toLowerCase() === factClean.toLowerCase()
      ) {
        // Bump timestamp and confidence
        existing.createdAt = Date.now();
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
        await this.save();
        return existing;
      }
    }

    const item: MemoryItem = {
      id: `mem-${randomUUID().slice(0, 8)}`,
      entity: entityClean || 'global',
      category: params.category || 'fact',
      fact: factClean,
      confidence: Math.max(0.1, Math.min(1.0, params.confidence ?? 0.8)),
      author: params.author || 'system',
      createdAt: Date.now(),
      tags: params.tags || this.extractAutoTags(entityClean, factClean),
    };

    this.items.set(item.id, item);
    this.evictIfNeeded();
    await this.save();
    return item;
  }

  /**
   * RECALL: 4-way hybrid retrieval bounded by token budget.
   */
  public async recall(options: RecallOptions = {}): Promise<{
    items: MemoryItem[];
    formattedContext: string;
    tokensUsed: number;
    budget: number;
  }> {
    await this.ensureLoaded();

    const queryTokens = (options.query ?? '')
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);
    const targetEntity = (options.entity ?? '').toLowerCase().trim();
    const targetCategory = options.category;
    const tokenBudget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const charBudget = tokenBudget * CHARS_PER_TOKEN;

    const scored: { item: MemoryItem; score: number }[] = [];
    const now = Date.now();

    for (const item of this.items.values()) {
      if (targetCategory && item.category !== targetCategory) {
        continue;
      }

      let score = 0;

      // 1. Entity match (Weight: 40 points)
      if (targetEntity) {
        const itemEntity = item.entity.toLowerCase();
        if (itemEntity === targetEntity) {
          score += 40;
        } else if (itemEntity.includes(targetEntity) || targetEntity.includes(itemEntity)) {
          score += 25;
        }
      }

      // 2. Keyword / Token overlap with query (Weight: 35 points)
      if (queryTokens.length > 0) {
        const itemText = `${item.entity} ${item.fact} ${item.tags.join(' ')}`.toLowerCase();
        let matches = 0;
        for (const token of queryTokens) {
          if (itemText.includes(token)) {
            matches++;
          }
        }
        score += (matches / queryTokens.length) * 35;
      } else {
        score += 15;
      }

      // 3. Recency decay (Weight: 15 points)
      // Items within the last 24h get full recency score; decays over 14 days
      const ageHours = (now - item.createdAt) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 15 * (1 - ageHours / (24 * 14)));
      score += recencyScore;

      // 4. Confidence weight (Weight: 10 points)
      score += item.confidence * 10;

      if (score > 10) {
        scored.push({ item, score });
      }
    }

    // Sort descending by relevance score
    scored.sort((a, b) => b.score - a.score);

    // Pack into character/token budget
    const selected: MemoryItem[] = [];
    let currentChars = 0;
    const lines: string[] = [];

    const limit = options.limit ?? 20;

    for (const { item } of scored) {
      if (selected.length >= limit) break;
      const line = `[${item.category.toUpperCase()}] (${item.entity}) ${item.fact}`;
      if (currentChars + line.length > charBudget && selected.length > 0) {
        break;
      }
      selected.push(item);
      lines.push(line);
      currentChars += line.length + 1;
    }

    const formattedContext = lines.length > 0
      ? `## HINDSIGHT SHARED MEMORY:\n${lines.map((l) => `- ${l}`).join('\n')}`
      : '';

    return {
      items: selected,
      formattedContext,
      tokensUsed: Math.ceil(currentChars / CHARS_PER_TOKEN),
      budget: tokenBudget,
    };
  }

  /**
   * REFLECT: Analyzes recent failures or facts across subagents and
   * creates consolidated rules / heuristics via Sentinel Router.
   */
  public async reflect(topic?: string, model = 'sentinel-flagship'): Promise<MemoryItem | null> {
    await this.ensureLoaded();

    const recent = Array.from(this.items.values())
      .filter((i) => !topic || i.entity.includes(topic) || i.tags.includes(topic))
      .slice(-25);

    if (recent.length === 0) {
      return null;
    }

    const memoryDigest = recent
      .map((i) => `[${i.category}] (${i.entity}, author=${i.author}): ${i.fact}`)
      .join('\n');

    const prompt = `
Analyze the following recorded experiences from multiple subagents:
${memoryDigest}

Task: Synthesize 1 to 3 overarching lessons learned, rules of thumb, or heuristics so future subagents do not repeat mistakes or duplicate effort. Keep it concise, high-signal, and factual.
`;

    const res = await routerOperatorChat({
      model,
      prompt,
      persona: 'You are Hindsight, the cognitive memory synthesizer for Sentinel autonomous agents.',
      maxTokens: 512,
    });

    if (!res.ok || !res.content) {
      return null;
    }

    const reflection = await this.retain({
      entity: topic || 'global-reflection',
      fact: res.content.trim(),
      category: 'reflection',
      author: 'hindsight-reflect',
      confidence: 0.95,
      tags: ['reflection', 'heuristic', ...(topic ? [topic] : [])],
    });

    return reflection;
  }

  public async all(): Promise<MemoryItem[]> {
    await this.ensureLoaded();
    return Array.from(this.items.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public async count(): Promise<number> {
    await this.ensureLoaded();
    return this.items.size;
  }

  public async clear(): Promise<void> {
    this.items.clear();
    await this.save();
  }

  private extractAutoTags(entity: string, fact: string): string[] {
    const text = `${entity} ${fact}`.toLowerCase();
    const candidates = ['login', 'auth', 'api', 'port', 'token', 'error', 'vuln', 'ssl', 'timeout'];
    return candidates.filter((c) => text.includes(c));
  }
}

export const hindsight = new HindsightStore();
