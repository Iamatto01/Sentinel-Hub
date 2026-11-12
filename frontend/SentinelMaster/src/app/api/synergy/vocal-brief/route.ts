import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import { generateEcosystemVocalBrief } from '@/lib/synergy';

export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await generateEcosystemVocalBrief();
    return ok({ data: result });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Vocal brief generation failed');
  }
}
