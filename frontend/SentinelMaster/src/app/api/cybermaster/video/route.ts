import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams a rendered CyberMaster video.
 *
 * This is the only route that serves bytes rather than JSON, so it cannot use
 * the `ok()` envelope — but it still authenticates with `guard()` and reports
 * failures through `fail()` so error shapes stay uniform across the API.
 *
 * `day` and `type` are validated against a whitelist rather than concatenated
 * into the path, so a caller cannot walk out of `output/`.
 */

const BASE_DIR =
  process.platform === 'win32'
    ? 'f:\\INI KALI LA\\Sentinel-CyberMaster'
    : '/home/kali/server/Sentinel-CyberMaster';

const FILENAMES: Record<string, string> = {
  short: 'social_short.mp4',
  deepdive: 'deepdive_tutorial.mp4',
};

const MAX_DAY = 999;

function resolveVideo(day: number, type: string): string | null {
  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return null;
  const fileName = FILENAMES[type];
  if (!fileName) return null;
  return path.join(BASE_DIR, 'output', `day_${String(day).padStart(2, '0')}`, fileName);
}

function streamFile(filePath: string, start: number, end: number): ReadableStream<Uint8Array> {
  const file = fs.createReadStream(filePath, { start, end });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      file.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      file.on('end', () => controller.close());
      file.on('error', (error) => controller.error(error));
    },
    cancel() {
      file.destroy();
    },
  });
}

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const { searchParams } = new URL(request.url);
    const day = Number.parseInt(searchParams.get('day') ?? '1', 10);
    const type = searchParams.get('type') ?? 'deepdive';

    const filePath = resolveVideo(day, type);
    if (!filePath) {
      return fail(400, 'Invalid day or type', `day must be 1-${MAX_DAY}, type must be short or deepdive`);
    }

    let fileSize: number;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return fail(404, 'Video file not found', filePath);
      fileSize = stat.size;
    } catch {
      return fail(404, 'Video file not found', filePath);
    }

    if (fileSize === 0) return fail(404, 'Video file is empty', filePath);

    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) return fail(416, 'Malformed range header', range);

      // `bytes=-N` is the final N bytes; `bytes=N-` is N through EOF.
      const [, rawStart, rawEnd] = match;
      let start: number;
      let end: number;
      if (rawStart === '') {
        if (rawEnd === '') return fail(416, 'Malformed range header', range);
        start = Math.max(0, fileSize - Number.parseInt(rawEnd, 10));
        end = fileSize - 1;
      } else {
        start = Number.parseInt(rawStart, 10);
        end = rawEnd === '' ? fileSize - 1 : Number.parseInt(rawEnd, 10);
      }

      if (start > end || start >= fileSize) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes' },
        });
      }
      end = Math.min(end, fileSize - 1);

      return new Response(streamFile(filePath, start, end), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': 'video/mp4',
          'Cache-Control': 'private, max-age=0, must-revalidate',
        },
      });
    }

    return new Response(streamFile(filePath, 0, fileSize - 1), {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Error streaming video');
  }
}
