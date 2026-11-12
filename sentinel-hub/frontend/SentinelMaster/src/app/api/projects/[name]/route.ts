import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, toErrorResponse } from '@/lib/http';
import { resolveProject, scanProjectsWithRuntime } from '@/lib/projects';
import { getBranches, getChangedPaths, getDiffStat, getLog, getStatus } from '@/lib/git';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full detail for one project: metadata, working tree, history and branches. */
export async function GET(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const { name } = await context.params;
  try {
    const target = await resolveProject(name);
    if (!target) return fail(404, 'Project not found');

    const scan = await scanProjectsWithRuntime();
    const summary = scan.projects.find((project) => project.path === target.path) ?? null;

    const status = await getStatus(target.path);
    const [log, branches, diffStat, changed] = await Promise.all([
      status.isRepo ? getLog(target.path, 40) : Promise.resolve([]),
      status.isRepo ? getBranches(target.path) : Promise.resolve([]),
      status.isRepo && !status.clean ? getDiffStat(target.path) : Promise.resolve(''),
      status.isRepo ? getChangedPaths(target.path) : Promise.resolve([]),
    ]);

    return ok({
      data: { summary, status, log, branches, diffStat, changed },
      name: target.name,
      path: target.path,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
