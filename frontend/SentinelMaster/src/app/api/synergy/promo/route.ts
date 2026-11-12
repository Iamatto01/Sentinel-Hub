import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import { generateProjectPromo } from '@/lib/synergy';

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const projectName = (body.project || '').trim();
    if (!projectName) return fail(400, 'Target project name is required');

    const result = await generateProjectPromo(projectName);
    return ok({ data: result });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Promo generation failed');
  }
}
