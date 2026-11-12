import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, fail, toErrorResponse } from '@/lib/http';
import { hindsight } from '@/lib/orchestrator/memory';
import type { MemoryCategory } from '@/lib/orchestrator/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = new Set<string>([
  'fact', 'credential', 'endpoint', 'failure', 'reflection', 'selector',
]);

function isValidCategory(value: string): value is MemoryCategory {
  return VALID_CATEGORIES.has(value);
}

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || undefined;
    const entity = url.searchParams.get('entity') || undefined;
    const rawCategory = url.searchParams.get('category');
    const category = rawCategory && isValidCategory(rawCategory) ? rawCategory : undefined;

    // Validate budget parameter to prevent NaN poisoning
    const rawBudget = url.searchParams.get('budget');
    let budget = 1500;
    if (rawBudget) {
      const parsed = Number(rawBudget);
      if (!Number.isFinite(parsed) || parsed < 100 || parsed > 10000) {
        return fail(400, 'Budget must be a number between 100 and 10000.');
      }
      budget = parsed;
    }

    if (query || entity || category) {
      const recalled = await hindsight.recall({
        query,
        entity,
        category,
        tokenBudget: budget,
      });
      return ok({ data: recalled });
    }

    return ok({ data: { items: await hindsight.all(), count: await hindsight.count() } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = (await request.json()) as {
      action?: 'retain' | 'reflect' | 'clear';
      entity?: string;
      fact?: string;
      category?: string;
      author?: string;
      confidence?: number;
      tags?: string[];
      topic?: string;
      model?: string;
    };

    if (body.action === 'reflect') {
      const reflection = await hindsight.reflect(body.topic, body.model || 'sentinel-flagship');
      return ok({ data: { reflection } });
    }

    if (body.action === 'clear') {
      await hindsight.clear();
      return ok({ data: { cleared: true } });
    }

    // Default: retain
    if (!body.fact || !body.fact.trim()) {
      return fail(400, 'Fact is required to retain memory.');
    }

    // Validate category if provided
    const category: MemoryCategory = body.category && isValidCategory(body.category)
      ? body.category
      : 'fact';

    const item = await hindsight.retain({
      entity: body.entity || 'manual',
      fact: body.fact.trim(),
      category,
      author: body.author || 'operator',
      confidence: body.confidence ?? 1.0,
      tags: body.tags,
    });

    return ok({ data: item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
