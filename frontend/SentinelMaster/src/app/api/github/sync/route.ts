import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { describeGithubError, syncRepo } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = await readJson<{ owner?: unknown; name?: unknown; localProject?: unknown }>(request);
    const owner = typeof body?.owner === 'string' ? body.owner.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const localProject = typeof body?.localProject === 'string' ? body.localProject.trim() : undefined;

    if (!owner || !name) {
      return fail(400, 'Owner and repository name are required');
    }

    const result = await syncRepo(owner, name, localProject);
    return ok({ data: result });
  } catch (error) {
    const described = describeGithubError(error);
    return fail(described.status, described.message);
  }
}
