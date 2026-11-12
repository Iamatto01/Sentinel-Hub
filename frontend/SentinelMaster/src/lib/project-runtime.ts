import { getStatus, type Pm2Process } from './kali';
import { bindProjects, type ProjectRuntime } from './project-runtime-core';

/**
 * Server-side half of the project runtime binding.
 *
 * The derivation rules live in `project-runtime-core.ts` so client components
 * can import them without dragging the Kali bridge — and with it `node:path`
 * and `node:child_process` — into the browser bundle. This module adds the one
 * piece that genuinely needs the bridge.
 */

export {
  aggregateState,
  bindProjects,
  hubProcessName,
  toRuntime,
} from './project-runtime-core';
export type { ProjectRuntime, ProjectRuntimeState, RuntimeProcess } from './project-runtime-core';

/**
 * Bindings for every project, keyed by the project's scan path.
 *
 * Returns an empty map when the Kali host is unreachable, so a project listing
 * degrades to "not managed" instead of failing outright.
 */
export async function getRuntimeMap(projectPaths: string[]): Promise<Map<string, ProjectRuntime[]>> {
  if (projectPaths.length === 0) return new Map<string, ProjectRuntime[]>();

  let processes: Pm2Process[] = [];
  try {
    const status = await getStatus();
    processes = status.pm2 ?? [];
  } catch {
    return new Map<string, ProjectRuntime[]>();
  }

  return bindProjects(projectPaths, processes);
}
