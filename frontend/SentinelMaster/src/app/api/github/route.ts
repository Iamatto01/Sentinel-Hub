import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson, toErrorResponse } from '@/lib/http';
import {
  GithubNotConfigured,
  describeGithubError,
  getAuthenticatedUser,
  getTokenScopes,
  listOrgs,
  listRepos,
  saveGithubToken,
} from '@/lib/github';
import { scanProjects } from '@/lib/projects';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GitHub account, token scopes, repositories, organizations and how they map to local projects. */
export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const [scopes, repos, orgs, scan] = await Promise.all([
      getTokenScopes(),
      listRepos({ perPage: 100, affiliation: 'owner,collaborator,organization_member' }),
      listOrgs(),
      scanProjects(),
    ]);
    const user = await getAuthenticatedUser();

    const localBySlug = new Map<string, string>();
    const localWebUrlBySlug = new Map<string, string>();
    for (const project of scan.projects) {
      if (project.git.remoteSlug) {
        const slug = project.git.remoteSlug.toLowerCase();
        localBySlug.set(slug, project.name);
        if (project.webUrl) {
          localWebUrlBySlug.set(slug, project.webUrl);
        }
      }
    }

    return ok({
      data: {
        configured: true,
        user,
        username: env.github.username,
        scopes,
        repos,
        orgs,
        localBySlug: Object.fromEntries(localBySlug),
        localWebUrlBySlug: Object.fromEntries(localWebUrlBySlug),
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

/** Connects or updates GitHub token from the web UI. */
export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = await readJson<{ token?: unknown }>(request);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return fail(400, 'GitHub token or code is required');
    }

    const result = await saveGithubToken(token);
    return ok({
      data: {
        success: true,
        user: result.user,
        scopes: result.scopes,
        message: `Successfully connected GitHub as @${result.user.login}`,
      },
    });
  } catch (error) {
    const described = describeGithubError(error);
    return fail(described.status, described.message);
  }
}
