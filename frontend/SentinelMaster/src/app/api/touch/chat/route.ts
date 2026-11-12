import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';

const SENTINEL_SYSTEM_PROMPT = `You are SENTINEL — a next-generation neural executive assistant and cybernetic companion.
Your traits:
1. Highly intelligent, ultra-fast, sharp, loyal, and efficient.
2. Tone: Professional yet conversational cyber-assistant (like JARVIS/FRIDAY).
3. Brevity: Keep responses concise (under 3 sentences) unless the user specifically asks for code, deep analysis, or a detailed breakdown.
4. OS Actions: When the user asks you to open a program, control the PC, or perform a Windows task, include the action tag at the end of your response:
   [ACTION: <action keyword or command>]
   Available Actions:
   - Volume: [ACTION: volume_up], [ACTION: volume_down], [ACTION: volume_mute]
   - Security: [ACTION: lock]
   - System Utilities: [ACTION: taskmgr], [ACTION: terminal], [ACTION: explorer]
   - Apps: [ACTION: notepad], [ACTION: calc], [ACTION: start chrome], [ACTION: start spotify], [ACTION: code]
   - Web Search: [ACTION: search_google <query>], [ACTION: search_youtube <query>]
5. Image Generation: If the user asks you to draw, visualize, or generate an image, include:
   [GENERATE_IMAGE: <detailed prompt>]
6. Language: You effortlessly understand and speak both English and Bahasa Malaysia depending on user input.`;

function fallbackSmartReply(query: string): string {
  const q = query.toLowerCase().trim();

  // Greetings in Malay & English
  if (['halo', 'hello', 'hi', 'hai', 'assalamualaikum', 'salam', 'hey sentinel', 'hey'].some((w) => q.startsWith(w) || q === w)) {
    return 'Hai! Saya Sentinel, neural assistant anda. Semua sistem beroperasi pada tahap optimum. Ada apa-apa arahan untuk saya bantu sekarang?';
  }

  // Voice / Listening check
  if (['boleh dengar', 'dengar tak', 'dengar ke', 'can you hear me', 'can you hear', 'dengar'].some((w) => q.includes(w))) {
    return 'Ya, saya dengar anda dengan sangat jelas! Mikrofoni neural dan audio synth Sentinel berfungsi dengan sempurna.';
  }

  // Identity
  if (['siapa kamu', 'siapa kau', 'siapa awak', 'who are you', 'apa itu sentinel'].some((w) => q.includes(w))) {
    return 'Saya adalah SENTINEL — neural companion dan pembantu eksekutif autonomi anda. Saya boleh mengawal PC, memantau server Kali Linux, dan melaksanakan tugas anda.';
  }

  // Health / Status
  if (['apa khabar', 'how are you', 'sihat ke', 'status', 'telemetry', 'specs', 'health', 'cpu', 'ram'].some((w) => q.includes(w))) {
    return 'Sentinel Neural Core berstatus AKTIF dan OPTIMUM. Telemetri perkakasan normal dan pelayan Kali Linux bersedia menerima tugasan.';
  }

  // Volume controls
  if (['mute', 'unmute', 'senyap', 'diam', 'senyapkan'].some((w) => q.includes(w))) {
    return 'Audio dilaraskan kepada mod senyap. [ACTION: volume_mute]';
  }
  if (['volume up', 'louder', 'kuat suara', 'tinggi suara', 'besarkan suara'].some((w) => q.includes(w))) {
    return 'Meningkatkan kelantangan audio sistem. [ACTION: volume_up]';
  }
  if (['volume down', 'quieter', 'lower volume', 'perlahan suara', 'kurang suara', 'perlahankan'].some((w) => q.includes(w))) {
    return 'Memperlahankan kelantangan audio sistem. [ACTION: volume_down]';
  }

  // Security Lock
  if (['lock pc', 'lock computer', 'lock screen', 'kunci pc', 'kunci skrin', 'kunci komputer'].some((w) => q.includes(w))) {
    return 'Mengunci stesen kerja serta-merta untuk keselamatan. [ACTION: lock]';
  }

  // App shortcuts
  if (q.includes('task manager') || q.includes('taskmgr')) {
    return 'Membuka Windows Task Manager. [ACTION: taskmgr]';
  }
  if (['terminal', 'cmd', 'command prompt', 'powershell'].some((w) => q.includes(w))) {
    return 'Membuka command terminal. [ACTION: terminal]';
  }
  if (['explorer', 'my files', 'open files', 'file manager', 'fail'].some((w) => q.includes(w))) {
    return 'Membuka File Explorer. [ACTION: explorer]';
  }
  if (q.includes('notepad')) {
    return 'Membuka Notepad sekarang. [ACTION: notepad]';
  }
  if (q.includes('calc') || q.includes('calculator') || q.includes('kalkulator')) {
    return 'Membuka Kalkulator Windows. [ACTION: calc]';
  }
  if (q.includes('vs code') || q.includes('vscode') || q.includes('visual studio code')) {
    return 'Membuka Visual Studio Code. [ACTION: code]';
  }

  // Web searches
  if (q.includes('search youtube for') || (q.includes('youtube') && (q.includes('cari') || q.includes('search')))) {
    const target = q.replace(/search youtube for|cari di youtube|youtube/gi, '').trim();
    return `Mencari video '${target}' di YouTube. [ACTION: search_youtube ${target}]`;
  }
  if (q.includes('search google for') || (q.includes('google') && (q.includes('cari') || q.includes('search')))) {
    const target = q.replace(/search google for|cari di google|google/gi, '').trim();
    return `Mencari '${target}' di Google. [ACTION: search_google ${target}]`;
  }

  // Image Generation
  if (['lukis', 'draw', 'generate image', 'gambar', 'visualize'].some((w) => q.includes(w))) {
    return `Menjana unjuran visual mengikut arahan anda sekarang. [GENERATE_IMAGE: ${query}]`;
  }

  return `Sentinel menerima: "${query}". Neural core aktif dan bersedia untuk arahan seterusnya.`;
}

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const userMsg = (body.message || '').trim();
    if (!userMsg) return fail(400, 'Empty message');

    const openrouterKey = body.openrouterKey || process.env.OPENROUTER_API_KEY || '';
    const groqKey = body.groqApiKey || process.env.GROQ_API_KEY || '';
    const apiKey = body.apiKey || process.env.GEMINI_API_KEY || '';
    const routerEndpoint = process.env.ROUTER_API_BASE || 'http://127.0.0.1:20128/v1';
    // No literal fallback. A committed key is a leak, and the gateway rejects an
    // unauthenticated request anyway, so the literal only ever produced a 401.
    const routerKey = process.env.ROUTER_API_KEY || '';
    // `llama-3.3-70b-versatile` is a Groq model id; it does not exist on the
    // gateway, so this branch always failed. Default to a verified live alias.
    const routerModel = process.env.ROUTER_CHAT_MODEL || 'sentinel-flagship';

    let aiReply = '';
    let executedAction: { command: string; result: string } | null = null;
    let imageUrl: string | null = null;

    // 1. Direct OpenRouter if configured
    if (!aiReply && openrouterKey) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sentinelai.studio',
            'X-Title': 'Sentinel Master Hub',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
              { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
              ...(body.history || []).slice(-6),
              { role: 'user', content: userMsg },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          aiReply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    // 2. Local / Remote 9Router
    if (!aiReply && routerEndpoint) {
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
              { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
              ...(body.history || []).slice(-6),
              { role: 'user', content: userMsg },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          aiReply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    // 3. Groq Cloud API
    if (!aiReply && groqKey) {
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
              ...(body.history || []).slice(-8),
              { role: 'user', content: userMsg },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          aiReply = data.choices?.[0]?.message?.content || '';
        }
      } catch {
        // Fallback
      }
    }

    // 4. Google AI Studio API
    if (!aiReply && apiKey) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${SENTINEL_SYSTEM_PROMPT}\n\nUser: ${userMsg}` }] }],
            }),
          },
        );
        if (resp.ok) {
          const data = await resp.json();
          aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch {
        // Fallback
      }
    }

    // 5. Smart Multilingual Offline Fallback
    if (!aiReply) {
      aiReply = fallbackSmartReply(userMsg);
    }

    // Check for [ACTION: ...]
    const actionMatch = aiReply.match(/\[ACTION:\s*(.+?)\]/i);
    if (actionMatch) {
      const actionCmd = actionMatch[1].trim();
      executedAction = { command: actionCmd, result: 'queued' };
    }

    // Check for [GENERATE_IMAGE: ...]
    const imgMatch = aiReply.match(/\[GENERATE_IMAGE:\s*(.+?)\]/i);
    if (imgMatch) {
      const prompt = imgMatch[1].trim();
      imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${Math.floor(
        Math.random() * 99999,
      )}&nologo=true`;
    }

    return ok({
      data: {
        reply: aiReply,
        action: executedAction,
        imageUrl,
        timestamp: new Date().toLocaleTimeString(),
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Chat processing failed');
  }
}
