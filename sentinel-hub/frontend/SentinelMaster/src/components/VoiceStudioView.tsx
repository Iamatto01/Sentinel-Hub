'use client';

import { useState, useRef, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

export default function VoiceStudioView() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState('My_Voice_Master');
  const [activeVoice, setActiveVoice] = useState('My_Voice_Master.wav');
  const [samples, setSamples] = useState<Array<{ filename: string; url: string; sizeKb: number }>>([]);
  const [testText, setTestText] = useState('Good morning sir. Sentinel neural systems are fully operational.');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthAudioUrl, setSynthAudioUrl] = useState<string | null>(null);
  const [synthEngine, setSynthEngine] = useState('local-clone'); // 'local-clone' | 'browser' | 'elevenlabs'
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Load samples
  const loadSamples = async () => {
    try {
      const res = await fetch('/api/voice/samples');
      if (res.ok) {
        const json = await res.json();
        if (json.data?.samples) setSamples(json.data.samples);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSamples();
  }, []);

  // Start Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access is required to record your voice.');
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // Upload/Save Voice Sample
  const saveSample = async () => {
    if (audioChunksRef.current.length === 0) return;
    setStatusMessage('Saving voice reference sample...');

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await fetch('/api/voice/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: voiceName, audio: base64Data }),
        });
        if (res.ok) {
          const json = await res.json();
          setStatusMessage(`Voice sample "${json.data?.filename}" registered successfully!`);
          setActiveVoice(json.data?.filename);
          loadSamples();
        }
      } catch {
        setStatusMessage('Error saving voice sample.');
      }
    };
  };

  // Test Synthesis
  const testSynthesize = async () => {
    if (!testText.trim()) return;
    setSynthesizing(true);
    setStatusMessage(`Synthesizing with engine: ${synthEngine}...`);

    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          engine: synthEngine,
          voiceSample: activeVoice,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data?.audioUrl) {
          setSynthAudioUrl(json.data.audioUrl);
          const audio = new Audio(json.data.audioUrl);
          audio.play();
          setStatusMessage('Voice synthesis successful. Playing cloned audio.');
        } else {
          // Browser synthesis fallback
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(testText);
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
            setStatusMessage('Playing browser neural voice fallback.');
          }
        }
      }
    } catch {
      setStatusMessage('Synthesis request failed.');
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Voice Studio"
        subtitle="Open-Source ElevenLabs Alternative · Zero-Shot Voice Cloning & Assistant Synthesis"
      />

      <PageBody>
        {/* Architecture Notice */}
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            background: 'rgba(79, 140, 255, 0.08)',
            border: '1px solid rgba(79, 140, 255, 0.25)',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--accent)' }}>💡 Zero-Shot Voice Cloning Architecture:</strong>
          <br />
          Using state-of-the-art open source models (<strong>F5-TTS</strong> and <strong>Coqui XTTS-v2</strong>), you can
          clone your voice with only a <strong>5 to 10 second audio recording</strong> of yourself speaking naturally.
          Sentinel uses your cloned voice directly for all assistant responses — 100% free with zero subscription.
        </div>

        {/* Stats */}
        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Stat label="Active Voice Profile" value={activeVoice} foot="Assigned to Sentinel Assistant" />
          <Stat label="Saved Voice Samples" value={String(samples.length)} foot="Reference audio clips" />
          <Stat label="Cloning Engine" value="F5-TTS / XTTS" foot="Zero-shot flow matching" />
        </div>

        {/* Grid Sections */}
        <div className="grid cols-2" style={{ gap: 20 }}>
          {/* Left: Record My Voice */}
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎙️ <span>Record Your Voice Sample</span>
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              Speak clearly into your microphone for 5–10 seconds. Read this sentence:
              <br />
              <em style={{ color: 'var(--text)', display: 'block', marginTop: 6 }}>
                &ldquo;I am Sentinel. All defense parameters and autonomous subroutines are online.&rdquo;
              </em>
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {!isRecording ? (
                <button type="button" className="btn primary" onClick={startRecording}>
                  ● Start 5-Second Recording
                </button>
              ) : (
                <button type="button" className="btn red" onClick={stopRecording}>
                  ■ Stop Recording ({recordDuration}s)
                </button>
              )}
            </div>

            {/* Playback recorded audio */}
            {audioBlobUrl ? (
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                  Preview Recording:
                </span>
                <audio src={audioBlobUrl} controls style={{ width: '100%', height: 38 }} />
              </div>
            ) : null}

            {/* Save Profile */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Voice profile name"
                className="input"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                disabled={!audioBlobUrl || isRecording}
                onClick={saveSample}
              >
                Save & Set Active Voice
              </button>
            </div>
          </Card>

          {/* Right: Synthesis Test Bench & Assistant Link */}
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>🔊 Assistant Voice Synthesis Tester</h3>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              Test speech generation using your cloned voice profile or switch synthesis providers.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Synthesis Engine
              </label>
              <select
                value={synthEngine}
                onChange={(e) => setSynthEngine(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="local-clone">🚀 Open-Source F5-TTS / XTTS (Zero-Shot Clone)</option>
                <option value="browser">🌐 Browser Neural Speech Synthesis</option>
                <option value="elevenlabs">☁️ ElevenLabs API (Optional Cloud Fallback)</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Test Phrase
              </label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                rows={3}
                className="input"
                style={{ width: '100%', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn primary"
                disabled={synthesizing}
                onClick={testSynthesize}
              >
                {synthesizing ? 'Synthesizing Audio…' : '▶ Generate & Hear My Voice'}
              </button>
            </div>

            {synthAudioUrl ? (
              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--green)', display: 'block', marginBottom: 4 }}>
                  Synthesized Audio Result:
                </span>
                <audio src={synthAudioUrl} controls style={{ width: '100%', height: 38 }} />
              </div>
            ) : null}

            {statusMessage ? (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)' }}>{statusMessage}</div>
            ) : null}
          </Card>
        </div>

        {/* Existing Voice Profiles List */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Saved Voice Profiles</h3>
          {samples.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              No voice samples recorded yet. Record a 5-second sample above to create your assistant voice profile!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {samples.map((s) => (
                <div
                  key={s.filename}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--panel-2)',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>🎵</span>
                    <div>
                      <strong style={{ fontSize: 13 }}>{s.filename}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>
                        {s.sizeKb} KB
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <audio src={s.url} controls style={{ height: 28, width: 180 }} />
                    <button
                      type="button"
                      className={`btn sm ${activeVoice === s.filename ? 'primary' : 'ghost'}`}
                      onClick={() => setActiveVoice(s.filename)}
                    >
                      {activeVoice === s.filename ? 'Active Voice' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
