import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';

export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const text = (body.text || '').trim();
    if (!text) return fail(400, 'Text to synthesize is required');

    const engine = body.engine || 'local-clone'; // 'local-clone' | 'elevenlabs' | 'piper' | 'browser'
    const voiceSample = body.voiceSample || 'my_voice.wav';
    const elevenLabsKey = body.elevenLabsKey || process.env.ELEVENLABS_API_KEY || '';
    const elevenVoiceId = body.elevenVoiceId || '21m00Tcm4TlvDq8ikWAM'; // default Rachel

    // 1. ElevenLabs API if configured
    if (engine === 'elevenlabs' && elevenLabsKey) {
      try {
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': elevenLabsKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: { stability: 0.75, similarity_boost: 0.85 },
          }),
        });

        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          return ok({
            data: {
              status: 'success',
              engine: 'elevenlabs',
              audioUrl: `data:audio/mp3;base64,${base64}`,
            },
          });
        }
      } catch {
        // Fall through
      }
    }

    // 2. Open-Source Local Voice Clone Worker (e.g. F5-TTS / XTTS running on port 8020)
    try {
      const localWorkerResp = await fetch('http://127.0.0.1:8020/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ref_audio: voiceSample }),
      });
      if (localWorkerResp.ok) {
        const data = await localWorkerResp.json();
        return ok({
          data: {
            status: 'success',
            engine: 'f5-tts-local-clone',
            audioUrl: data.audioUrl,
          },
        });
      }
    } catch {
      // Local worker not running; fallback to browser speech synthesis instruction
    }

    // 3. Browser Speech Synthesis Fallback
    return ok({
      data: {
        status: 'fallback',
        engine: 'browser-speech-api',
        text,
        voiceSample,
        message: 'Using high-fidelity browser neural speech synthesizer.',
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Speech synthesis failed');
  }
}
