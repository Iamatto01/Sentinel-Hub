import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { describeGithubError, getRepoReadmeAndFiles } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const owner = request.nextUrl.searchParams.get('owner');
  const name = request.nextUrl.searchParams.get('name');

  if (!owner || !name) {
    return fail(400, 'Owner and repository name are required');
  }

  try {
    const data = await getRepoReadmeAndFiles(owner, name);
    return ok({ data });
  } catch (error) {
    const described = describeGithubError(error);
    return fail(described.status, described.message);
  }
}
