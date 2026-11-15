import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson, toErrorResponse } from '@/lib/http';
import {
  planLoop,
  executeStep,
  verifySatisfaction,
  publishChanges,
  type LoopTask,
  type GeneratedFileChange,
} from '@/lib/github-loop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LoopRequestBody {
  action?: 'plan' | 'execute-step' | 'verify' | 'publish';
  owner?: string;
  name?: string;
  objective?: string;
  localProject?: string;
  model?: string;
  task?: LoopTask;
  completedTasks?: LoopTask[];
  existingFiles?: GeneratedFileChange[];
  iteration?: number;
  files?: GeneratedFileChange[];
  commitMessage?: string;
  branch?: string;
  createBranch?: boolean;
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const rawBody = await readJson<LoopRequestBody>(request);
    if (!rawBody) return fail(400, 'Invalid JSON request body.');
    const body = rawBody;
    const action = body.action;
    const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
    const localProject = typeof body.localProject === 'string' ? body.localProject.trim() : undefined;
    const model = typeof body.model === 'string' ? body.model.trim() : undefined;

    if (!owner || !name) {
      return fail(400, 'Repository owner and name are required.');
    }

    switch (action) {
      case 'plan': {
        if (!objective) return fail(400, 'Objective is required to generate the To-Do plan.');
        const plan = await planLoop({
          owner,
          name,
          objective,
          localProject,
          model,
        });
        return ok({ data: plan });
      }

      case 'execute-step': {
        if (!objective) return fail(400, 'Objective is required.');
        if (!body.task) return fail(400, 'Task is required to execute.');

        const result = await executeStep({
          owner,
          name,
          objective,
          task: body.task,
          completedTasks: Array.isArray(body.completedTasks) ? body.completedTasks : [],
          existingFiles: Array.isArray(body.existingFiles) ? body.existingFiles : [],
          localProject,
          model,
        });
        return ok({ data: result });
      }

      case 'verify': {
        if (!objective) return fail(400, 'Objective is required.');
        const verification = await verifySatisfaction({
          owner,
          name,
          objective,
          completedTasks: Array.isArray(body.completedTasks) ? body.completedTasks : [],
          generatedFiles: Array.isArray(body.files) ? body.files : [],
          iteration: typeof body.iteration === 'number' ? body.iteration : 1,
          model,
        });
        return ok({ data: verification });
      }

      case 'publish': {
        const files = Array.isArray(body.files) ? body.files : [];
        const commitMessage = typeof body.commitMessage === 'string' ? body.commitMessage.trim() : '';
        const branch = typeof body.branch === 'string' ? body.branch.trim() : 'main';
        const createBranch = Boolean(body.createBranch);

        if (!commitMessage) {
          return fail(400, 'A commit message is required before publishing.');
        }
        if (files.length === 0) {
          return fail(400, 'There are no files to publish.');
        }

        const pubResult = await publishChanges({
          owner,
          name,
          localProject,
          files,
          commitMessage,
          branch,
          createBranch,
        });

        return ok({ data: pubResult });
      }

      default:
        return fail(400, 'Invalid action. Expected "plan", "execute-step", "verify", or "publish".');
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
