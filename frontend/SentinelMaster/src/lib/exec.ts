import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class ExecFailure extends Error {
  constructor(
    message: string,
    readonly result: ExecResult,
  ) {
    super(message);
    this.name = 'ExecFailure';
  }
}

/**
 * Runs an executable with an argument array. Never uses a shell, so untrusted
 * project names and branch names cannot be interpreted as commands.
 */
export async function run(
  file: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 45_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      shell: false,
      env: { ...process.env, ...options.env },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    const result: ExecResult = {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      code: typeof err.code === 'number' ? err.code : 1,
    };
    throw new ExecFailure(err.message ?? `${file} failed`, result);
  }
}

/** Runs a git subcommand scoped to `cwd`. Git is invoked with `-C` so the child never needs to chdir. */
export async function runGit(args: string[], cwd: string, timeoutMs = 45_000): Promise<ExecResult> {
  return run('git', ['-C', cwd, ...args], {
    timeoutMs,
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'echo',
      GCM_INTERACTIVE: 'never',
      LC_ALL: 'C',
    },
  });
}

/** Runs git in the Hub's own directory (used for exporting the local SSH key). */
export async function runGitHere(args: string[], timeoutMs = 45_000): Promise<ExecResult> {
  return run('git', args, { timeoutMs });
}

/** Splits a command's stdout into non-empty trimmed lines. */
export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
