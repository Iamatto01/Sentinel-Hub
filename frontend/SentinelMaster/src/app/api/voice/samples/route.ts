import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import fs from 'node:fs';
import path from 'node:path';

const VOICES_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'voices');

function ensureDir() {
  if (!fs.existsSync(VOICES_DIR)) {
    fs.mkdirSync(VOICES_DIR, { recursive: true });
  }
}

export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  ensureDir();
  try {
    const files = fs.readdirSync(VOICES_DIR);
    const samples = files.map((file) => {
      const stat = fs.statSync(path.join(VOICES_DIR, file));
      return {
        filename: file,
        url: `/voices/${file}`,
        sizeKb: Math.round(stat.size / 1024),
        createdAt: stat.birthtime.toISOString(),
      };
    });
    return ok({ data: { samples } });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Failed to list samples');
  }
}

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  ensureDir();
  try {
    const body = await request.json();
    const dataUrl = (body.audio || '').trim();
    const name = (body.name || 'my_voice').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!dataUrl) return fail(400, 'Audio data URL is required');

    const b64 = dataUrl.split(',')[1] || dataUrl;
    const buffer = Buffer.from(b64, 'base64');
    const filename = `${name}.wav`;
    const filePath = path.join(VOICES_DIR, filename);

    fs.writeFileSync(filePath, buffer);

    return ok({
      data: {
        filename,
        url: `/voices/${filename}`,
        sizeKb: Math.round(buffer.length / 1024),
        message: 'Voice reference sample saved successfully',
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Failed to save sample');
  }
}
