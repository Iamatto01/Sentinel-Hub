import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const day = parseInt(searchParams.get('day') || '1', 10);

    const baseDir = process.platform === 'win32'
      ? 'f:\\INI KALI LA\\Sentinel-CyberMaster'
      : '/home/kali/server/Sentinel-CyberMaster';

    const currPath = path.join(baseDir, 'data', 'curriculum.json');
    const dayDir = path.join(baseDir, 'output', `day_${String(day).padStart(2, '0')}`);
    const mcqPath = path.join(dayDir, `mcq_day_${String(day).padStart(2, '0')}.json`);

    let curriculum = [];
    if (fs.existsSync(currPath)) {
      const currData = JSON.parse(fs.readFileSync(currPath, 'utf-8'));
      curriculum = currData.curriculum || [];
    }

    const metadata = curriculum.find((c: any) => c.day === day) || {
      day,
      title: `Day ${day} Mission`,
      category: 'Cybersecurity',
      summary: 'Daily lesson module',
    };

    let mcqs = [];
    if (fs.existsSync(mcqPath)) {
      mcqs = JSON.parse(fs.readFileSync(mcqPath, 'utf-8'));
    }

    const result = {
      day,
      metadata,
      mcqs,
      curriculum,
      videos: {
        deepdive: `/api/cybermaster/video?day=${day}&type=deepdive`,
        short: `/api/cybermaster/video?day=${day}&type=short`,
      },
    };

    return ok({
      ...result,
      data: result,
    });
  } catch (err: any) {
    return fail(500, err?.message || 'Failed to load CyberMaster data');
  }
}

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const action = body.action || 'generate';
    const day = body.day || 1;

    // Trigger local generation or submit answers
    if (action === 'grade') {
      const answers = body.answers || {};
      const baseDir = process.platform === 'win32'
        ? 'f:\\INI KALI LA\\Sentinel-CyberMaster'
        : '/home/kali/server/Sentinel-CyberMaster';
      const mcqPath = path.join(baseDir, 'output', `day_${String(day).padStart(2, '0')}`, `mcq_day_${String(day).padStart(2, '0')}.json`);

      if (!fs.existsSync(mcqPath)) {
        return fail(404, 'MCQs not found for this day');
      }

      const mcqs = JSON.parse(fs.readFileSync(mcqPath, 'utf-8'));
      let correct = 0;
      const breakdown = mcqs.map((q: any) => {
        const userChoice = (answers[String(q.id)] || '').toUpperCase();
        const isCorrect = userChoice === q.correct_answer.toUpperCase();
        if (isCorrect) correct++;
        return {
          id: q.id,
          question: q.question,
          userChoice,
          correct_answer: q.correct_answer,
          is_correct: isCorrect,
          explanation: q.explanation,
        };
      });

      const scorePercent = Math.round((correct / mcqs.length) * 100);
      return ok({
        day,
        total: mcqs.length,
        correct,
        scorePercent,
        passed: scorePercent >= 80,
        breakdown,
      });
    }

    return ok({ status: 'success', message: `Day ${day} action acknowledged.` });
  } catch (err: any) {
    return fail(500, err?.message || 'Failed to execute CyberMaster action');
  }
}
