import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson } from '@/lib/http';
import { describeKaliError, doAction, getStatus, type KaliAction } from '@/lib/kali';
import { bindProjects, hubProcessName, type ProjectRuntime } from '@/lib/project-runtime';
import { resolveProject, scanProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ACTIONS: KaliAction[] = ['start', 'stop', 'restart'];

/**
 * `kali-bridge.py` refuses the Hub's own process independently, and
 * `hubProcessName()` in `project-runtime.ts` is the shared source of that name.
 * The check is repeated here because this route is addressed by *project* name:
 * nothing in the URL tells the caller they are about to stop the server
 * answering them, and the refusal should be phrased in the operator's terms.
 */
interface StepResult {
  processName: string;
  ok: boolean;
  output: string;
}

/**
 * Runs one lifecycle action against every PM2 process bound to a project.
 *
 * A project may own more than one process — `SentinelAI` is served by a backend
 * and a frontend — so this is a fan-out, not a single call. Steps run in
 * sequence rather than in parallel: PM2 serialises its own state changes, and a
 * partially applied action is far easier to reason about when the results
 * arrive in a known order.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{ action?: unknown }>(request);
  const action = typeof body?.action === 'string' ? (body.action as KaliAction) : null;
  if (!action || !ACTIONS.includes(action)) {
    return fail(400, `action must be one of: ${ACTIONS.join(', ')}`);
  }

  const { name } = await context.params;
  try {
    const project = await resolveProject(name);
    if (!project) return fail(404, 'Project not found');

    const scan = await scanProjects();
    const summary = scan.projects.find((candidate) => candidate.path === project.path) ?? null;
    if (!summary) return fail(404, 'Project not found in the current scan');

    // Re-derive the binding from a fresh status rather than trusting the scan
    // cache: the operator is about to act on it, so it must be current.
    //
    // The whole project list is bound, not just this one, because the binder is
    // order-sensitive: a project literally named `server` would otherwise claim
    // `sentinel-web` (whose cwd ends in `/server`) here, while the UI — binding
    // all projects — correctly gives `sentinel-web` to `SentinelWeb` first. That
    // mismatch would let this route act on a process the UI never showed it
    // owning, which is exactly the kind of surprise an operator must not get.
    const status = await getStatus();
    const bindings: ProjectRuntime[] =
      bindProjects(
        scan.projects.map((candidate) => candidate.path),
        status.pm2 ?? [],
      ).get(summary.path) ?? [];

    if (bindings.length === 0) {
      return fail(
        409,
        `${summary.name} has no PM2 process bound to it. ` +
          'It is not managed by the Kali supervisor, so there is nothing to start or stop.',
      );
    }

    const self = hubProcessName();
    if (bindings.some((binding) => binding.processName === self)) {
      return fail(
        409,
        `${summary.name} is served by ${self}, which is the dashboard answering this request. ` +
          'Stopping it would leave no UI to recover from. Use SSH if that is genuinely intended.',
      );
    }

    const steps: StepResult[] = [];
    for (const binding of bindings) {
      try {
        const result = await doAction(action, binding.processName);
        steps.push({
          processName: binding.processName,
          ok: true,
          output: String((result as { output?: unknown }).output ?? 'Done'),
        });
      } catch (error) {
        steps.push({ processName: binding.processName, ok: false, output: describeKaliError(error).message });
      }
    }

    const succeeded = steps.filter((step) => step.ok);
    const failures = steps.filter((step) => !step.ok);

    if (succeeded.length === 0) {
      // `detail` is rendered verbatim by the client, so the per-process reasons
      // are flattened into it rather than nested — a nested object would show
      // up as `[object Object]`.
      const detail = failures.map((step) => `${step.processName}: ${step.output}`).join(' | ');
      return fail(502, `Action ${action} failed for every process of ${summary.name}`, detail);
    }

    return ok({
      data: {
        action,
        project: summary.name,
        processName: succeeded[0]!.processName,
        successes: succeeded.length,
        failures: failures.length,
        steps,
      },
    });
  } catch (error) {
    const described = describeKaliError(error);
    return fail(described.status, described.message);
  }
}
