import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson, toErrorResponse } from '@/lib/http';
import { resolveProject } from '@/lib/projects';
import {
  ensureIgnoreCoverage,
  generateCommitMessage,
  getStatus,
  initRepository,
  pull,
  push as pushBranch,
  sanitizeCommitMessage,
  setRemote,
  stageAndCommit,
} from '@/lib/git';
import { env } from '@/lib/env';
import { GithubNotConfigured } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GitAction = 'init' | 'commit' | 'push' | 'pull' | 'remote' | 'message' | 'ignore';

interface GitBody {
  action?: unknown;
  message?: unknown;
  branch?: unknown;
  slug?: unknown;
  remote?: unknown;
}

const ACTIONS: GitAction[] = ['init', 'commit', 'push', 'pull', 'remote', 'message', 'ignore'];

export async function GET(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { name } = await context.params;
  try {
    const target = await resolveProject(name);
    if (!target) return fail(404, 'Project not found');
    return ok({ data: await getStatus(target.path), name: target.name });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Mutating git operations for one project. Every action resolves the project
 * through `resolveProject()` first, so a crafted `name` can never escape the
 * configured projects root.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { name } = await context.params;
  const body = await readJson<GitBody>(request);
  const action = typeof body?.action === 'string' ? (body.action as GitAction) : null;
  if (!action || !ACTIONS.includes(action)) {
    return fail(400, `action must be one of: ${ACTIONS.join(', ')}`);
  }

  try {
    const target = await resolveProject(name);
    if (!target) return fail(404, 'Project not found');

    switch (action) {
      case 'init': {
        const result = await initRepository(target.path);
        return ok({ data: result });
      }

      case 'ignore': {
        const result = await ensureIgnoreCoverage(target.path);
        return ok({ data: result });
      }

      case 'message': {
        return ok({ data: await generateCommitMessage(target.path) });
      }

      case 'commit': {
        const raw = typeof body?.message === 'string' ? body.message : '';
        const generated = raw.trim().length > 0 ? null : await generateCommitMessage(target.path);
        const message = sanitizeCommitMessage(raw.trim().length > 0 ? raw : `${generated!.subject}\n\n${generated!.body}`);
        const result = await stageAndCommit(target.path, message);
        return ok({ data: result, message });
      }

      case 'remote': {
        const slug = typeof body?.slug === 'string' ? body.slug : '';
        if (!/^[A-Za-z0-9._-]{1,64}\/[A-Za-z0-9._-]{1,100}$/.test(slug)) {
          return fail(400, 'slug must look like owner/repository');
        }
        await setRemote(target.path, slug);
        return ok({ data: { slug }, status: await getStatus(target.path) });
      }

      case 'push': {
        if (!env.github.token) throw new GithubNotConfigured();
        const status = await getStatus(target.path);
        if (!status.isRepo) return fail(409, 'This directory is not a git repository yet');
        const branch = typeof body?.branch === 'string' ? body.branch : status.branch;
        if (!branch) return fail(409, 'No branch is checked out');
        const result = await pushBranch(target.path, branch, 'origin');
        return ok({ data: result });
      }

      case 'pull': {
        const status = await getStatus(target.path);
        if (!status.isRepo) return fail(409, 'This directory is not a git repository yet');
        const branch = typeof body?.branch === 'string' ? body.branch : undefined;
        const result = await pull(target.path, branch);
        return ok({ data: result });
      }

      default:
        return fail(400, 'Unsupported action');
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
