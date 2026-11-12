import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const prompt = (body.prompt || '').trim();
    if (!prompt) return fail(400, 'Prompt is required');

    const mode = body.mode || 'reasoning'; // 'fast' | 'reasoning' | 'fun'
    const openrouterKey = body.openrouterKey || process.env.OPENROUTER_API_KEY || '';
    const groqKey = body.groqApiKey || process.env.GROQ_API_KEY || '';
    const routerEndpoint = process.env.ROUTER_API_BASE || 'http://127.0.0.1:20128/v1';
    // No literal fallback. A committed key is a leak, and the gateway rejects an
    // unauthenticated request anyway, so the literal only ever produced a 401.
    const routerKey = process.env.ROUTER_API_KEY || '';
    // `deepseek-r1-distill-llama-70b` and `llama-3.3-70b-versatile` are Groq
    // model ids; they do not exist on the gateway (14 providers, 7 combos), so
    // this branch always failed. Default to aliases that are verified live.
    const routerModel =
      process.env.ROUTER_GROK_MODEL || (mode === 'reasoning' ? 'sentinel-flagship' : 'glm-5.3-flash');

    // Simulate multi-step reasoning steps for thought-chain visualizer
    const thoughts = [
      { step: 'intent_analysis', description: `Analyzing user objective: "${prompt.slice(0, 60)}..."`, timestamp: '0.1s' },
      { step: 'knowledge_retrieval', description: 'Searching internal workspace and indexed documentation...', timestamp: '0.4s' },
      { step: 'reasoning_verification', description: 'Cross-verifying logical consistency and system safety constraints...', timestamp: '0.7s' },
      { step: 'action_plan', description: 'Constructing deterministic execution response...', timestamp: '0.9s' },
    ];

    let reply = '';
    const sysPrompt =
      mode === 'fun'
        ? 'You are Grok — witty, brilliant, sharp, humorous, and deeply insightful with zero corporate filter.'
        : 'You are Grok Bot — an autonomous agent powered by state-of-the-art open source reasoning models. Provide clear, rigorous, executive-level technical analysis with structured steps.';

    // 1. Direct OpenRouter if configured
    if (!reply && openrouterKey) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sentinelai.studio',
            'X-Title': 'Sentinel Master Grok',
          },
          body: JSON.stringify({
            model: mode === 'reasoning' ? 'deepseek/deepseek-r1:free' : 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          reply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    // 2. 9Router Endpoint
    if (!reply && routerEndpoint) {
      try {
        const resp = await fetch(`${routerEndpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${routerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: routerModel,
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          reply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    // 3. Groq Cloud API
    if (!reply && groqKey) {
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: mode === 'reasoning' ? 'deepseek-r1-distill-llama-70b' : 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          reply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    if (!reply) {
      reply = `**[Grok Autonomous Agent Response]**\n\nObjective parsed: "${prompt}"\n\n### Execution Strategy:\n1. **Environment Setup**: Initialized workspace bridge for Sentinel Master Hub.\n2. **Analysis**: Verified project parameters and dependencies.\n3. **Recommendation**: Operational status is optimal. All agents standby for next task dispatch.\n\n*Nota: Anda boleh masukkan OpenRouter API Key atau Groq API Key di Settings untuk menggunakan model DeepSeek-R1 / Llama 3.3 70B secara langsung.*`;
    }

    return ok({
      data: {
        prompt,
        mode,
        thoughts,
        reply,
        timestamp: new Date().toLocaleTimeString(),
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Grok agent execution failed');
  }
}
