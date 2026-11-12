import { spawn } from 'node:child_process';
import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const command = (body.command || '').trim();
    if (!command) return fail(400, 'Empty action command');

    const cmdLower = command.toLowerCase();
    const isWindows = process.platform === 'win32';

    // Volume controls
    if (['volume_up', 'volup'].includes(cmdLower)) {
      if (isWindows) {
        spawn('powershell', ['-c', '(New-Object -ComObject WScript.Shell).SendKeys([char]175)'], { shell: true });
      }
      return ok({ data: { status: 'success', type: 'volume', action: 'volume_up' } });
    }

    if (['volume_down', 'voldown'].includes(cmdLower)) {
      if (isWindows) {
        spawn('powershell', ['-c', '(New-Object -ComObject WScript.Shell).SendKeys([char]174)'], { shell: true });
      }
      return ok({ data: { status: 'success', type: 'volume', action: 'volume_down' } });
    }

    if (['volume_mute', 'mute', 'unmute'].includes(cmdLower)) {
      if (isWindows) {
        spawn('powershell', ['-c', '(New-Object -ComObject WScript.Shell).SendKeys([char]173)'], { shell: true });
      }
      return ok({ data: { status: 'success', type: 'volume', action: 'volume_mute' } });
    }

    // Security Lock
    if (['lock', 'lock_screen', 'lock_pc'].includes(cmdLower)) {
      if (isWindows) {
        spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { shell: true });
      }
      return ok({ data: { status: 'success', type: 'security', action: 'lock' } });
    }

    // Common shortcuts
    if (['taskmgr', 'task_manager'].includes(cmdLower)) {
      if (isWindows) spawn('taskmgr', [], { shell: true });
      return ok({ data: { status: 'success', type: 'app', target: 'taskmgr' } });
    }

    if (['terminal', 'cmd', 'wt', 'powershell'].includes(cmdLower)) {
      if (isWindows) spawn('start wt || start cmd', [], { shell: true });
      return ok({ data: { status: 'success', type: 'app', target: 'terminal' } });
    }

    if (['explorer', 'files'].includes(cmdLower)) {
      if (isWindows) spawn('explorer', [], { shell: true });
      return ok({ data: { status: 'success', type: 'app', target: 'explorer' } });
    }

    if (cmdLower === 'notepad') {
      if (isWindows) spawn('notepad', [], { shell: true });
      return ok({ data: { status: 'success', type: 'app', target: 'notepad' } });
    }

    if (['calc', 'calculator'].includes(cmdLower)) {
      if (isWindows) spawn('calc', [], { shell: true });
      return ok({ data: { status: 'success', type: 'app', target: 'calc' } });
    }

    // URL or Search
    if (cmdLower.startsWith('http://') || cmdLower.startsWith('https://')) {
      if (isWindows) spawn('start', [command], { shell: true });
      return ok({ data: { status: 'success', type: 'url', target: command } });
    }

    if (cmdLower.startsWith('search_google ')) {
      const query = command.slice(14).trim();
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      if (isWindows) spawn('start', [url], { shell: true });
      return ok({ data: { status: 'success', type: 'google_search', target: url } });
    }

    if (cmdLower.startsWith('search_youtube ')) {
      const query = command.slice(15).trim();
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      if (isWindows) spawn('start', [url], { shell: true });
      return ok({ data: { status: 'success', type: 'youtube_search', target: url } });
    }

    // Default safe execution
    if (isWindows) {
      spawn(command, { shell: true });
    }

    return ok({ data: { status: 'success', type: 'command', target: command } });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Action execution failed');
  }
}
