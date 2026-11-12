import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), 'sentineltouch', 'sentinel_config.json');

const DEFAULT_CONFIG = {
  geminiWebUrl: 'http://localhost:3000/v1',
  geminiApiKey: '',
  groqApiKey: '',
  elevenLabsApiKey: '',
  defaultProvider: 'smart-offline',
  defaultModel: 'gemini-2.0-flash',
  voiceRate: 1.05,
  voicePitch: 1.0,
  wakeWord: 'sentinel',
  autoVoiceReply: true,
  clonedVoiceActive: false,
};

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Return default
  }
  return DEFAULT_CONFIG;
}

function writeConfig(cfg: typeof DEFAULT_CONFIG) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;
  return ok({ data: readConfig() });
}

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const current = readConfig();
    const updated = { ...current, ...body };
    writeConfig(updated);
    return ok({ data: updated });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Config save failed');
  }
}
