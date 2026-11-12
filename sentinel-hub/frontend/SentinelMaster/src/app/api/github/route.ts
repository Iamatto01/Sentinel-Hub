import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, toErrorResponse } from '@/lib/http';
import {
  GithubNotConfigured,
  describeGithubError,
  getAuthenticatedUser,
  getTokenScopes,
  listRepos,
} from '@/lib/github';
import { scanProjects } from '@/lib/projects';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GitHub account, token scopes, repositories and how they map to local projects. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const [scopes, repos, scan] = await Promise.all([
      getTokenScopes(),
      listRepos({ perPage: 100, affiliation: 'owner,collaborator,organization_member' }),
      scanProjects(),
    ]);
    const user = await getAuthenticatedUser();

    const localBySlug = new Map<string, string>();
    for (const project of scan.projects) {
      if (project.git.remoteSlug) localBySlug.set(project.git.remoteSlug.toLowerCase(), project.name);
    }

    return ok({
      data: {
        configured: true,
        user,
        username: env.github.username,
        scopes,
        repos,
        localBySlug: Object.fromEntries(localBySlug),
        unreferencedLocalRepos: scan.projects
          .filter((project) => project.git.isRepo && !project.git.remoteSlug)
          .map((project) => project.name),
      },
    });
  } catch (error) {
    if (error instanceof GithubNotConfigured) {
      return ok({ data: { configured: false, reason: 'GITHUB_TOKEN is not configured' } });
    }
    const described = describeGithubError(error);
    if (described.status === 401 || described.status === 403) {
      return fail(described.status, described.message);
    }
    return toErrorResponse(error);
  }
}
