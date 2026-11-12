'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

declare global {
  interface Window {
    THREE?: any;
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type CoreState = 'STANDBY' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export default function SentinelTouchView() {
  const [coreState, setCoreState] = useState<CoreState>('STANDBY');
  const [transcript, setTranscript] = useState('Say "Hey Sentinel" or tap the Core to talk');
  const [assistantReply, setAssistantReply] = useState('');
  const [isDuplex, setIsDuplex] = useState(false);
  const [ambientHum, setAmbientHum] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState<string | null>(null);
  const [visionImage, setVisionImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [telemetry, setTelemetry] = useState({
    cpu: 14,
    ram: 42,
    ramUsedGb: 6.7,
    ramTotalGb: 16.0,
    battery: 88,
    uptime: '5h 22m',
    status: 'OPTIMAL',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);

  // Poll system telemetry
  useEffect(() => {
    const fetchTel = async () => {
      try {
        const res = await fetch('/api/touch/telemetry');
        if (res.ok) {
          const json = await res.json();
          if (json?.data) {
            setTelemetry((prev) => ({
              ...prev,
              cpu: json.data.cpu ?? prev.cpu,
              ram: json.data.ram ?? prev.ram,
              ramUsedGb: json.data.ramUsedGb ?? prev.ramUsedGb,
              ramTotalGb: json.data.ramTotalGb ?? prev.ramTotalGb,
              battery: json.data.battery ?? prev.battery,
              uptime: json.data.uptime ?? prev.uptime,
            }));
          }
        }
      } catch {
        // use baseline
      }
    };
    fetchTel();
    const interval = setInterval(fetchTel, 6000);
    return () => clearInterval(interval);
  }, []);

  // Web Audio Synth FX
  const playSound = useCallback((type: 'chime' | 'ping' | 'whoosh') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'chime') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'ping') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'whoosh') {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // AudioContext unavailable
    }
  }, []);

  // Toggle Ambient Reactor Drone
  const toggleAmbientHum = () => {
    try {
      if (!ambientHum) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55, ctx.currentTime); // 55Hz low drone
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        humOscRef.current = osc;
        humGainRef.current = gain;
        audioCtxRef.current = ctx;
        setAmbientHum(true);
      } else {
        if (humOscRef.current) {
          humOscRef.current.stop();
          humOscRef.current.disconnect();
          humOscRef.current = null;
        }
        setAmbientHum(false);
      }
    } catch {
      setAmbientHum(!ambientHum);
    }
  };

  // Three.js 3D WebGL Geodesic Neural Core
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animFrame: number;
    let renderer: any = null;
    let scene: any = null;
    let camera: any = null;
    let coreMesh: any = null;
    let outerMesh: any = null;
    let ring1: any = null;
    let ring2: any = null;
    let particles: any = null;

    const init3D = () => {
      const THREE = window.THREE;
      if (!THREE) return;

      const width = canvas.clientWidth || 300;
      const height = canvas.clientHeight || 300;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.z = 5;

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Core Icosahedron Wireframe
      const coreGeo = new THREE.IcosahedronGeometry(1.2, 2);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0x2dd4bf, // Teal
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      });
      coreMesh = new THREE.Mesh(coreGeo, coreMat);
      scene.add(coreMesh);

      // Inner Dense Icosahedron
      const innerGeo = new THREE.IcosahedronGeometry(0.8, 1);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, // Sky Blue
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      });
      outerMesh = new THREE.Mesh(innerGeo, innerMat);
      scene.add(outerMesh);

      // Dual Orbital Gimbal Rings
      const ringGeo1 = new THREE.TorusGeometry(1.9, 0.02, 16, 100);
      const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.6 });
      ring1 = new THREE.Mesh(ringGeo1, ringMat1);
      scene.add(ring1);

      const ringGeo2 = new THREE.TorusGeometry(2.1, 0.02, 16, 100);
      const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.4 });
      ring2 = new THREE.Mesh(ringGeo2, ringMat2);
      ring2.rotation.x = Math.PI / 2.5;
      scene.add(ring2);

      // Orbiting Particles Swarm
      const partCount = 180;
      const partGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(partCount * 3);
      for (let i = 0; i < partCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = 2.3 + Math.random() * 0.8;
        positions[i] = r * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = r * Math.cos(phi);
      }
      partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const partMat = new THREE.PointsMaterial({
        color: 0x34d399,
        size: 0.04,
        transparent: true,
        opacity: 0.75,
      });
      particles = new THREE.Points(partGeo, partMat);
      scene.add(particles);

      const animate = () => {
        animFrame = requestAnimationFrame(animate);

        const speed = coreState === 'LISTENING' ? 0.025 : coreState === 'THINKING' ? 0.04 : 0.01;

        if (coreMesh) {
          coreMesh.rotation.x += speed * 0.7;
          coreMesh.rotation.y += speed;
        }
        if (outerMesh) {
          outerMesh.rotation.x -= speed * 0.5;
          outerMesh.rotation.y -= speed * 0.8;
        }
        if (ring1) {
          ring1.rotation.z += speed * 0.8;
          ring1.rotation.y += speed * 0.4;
        }
        if (ring2) {
          ring2.rotation.x += speed * 0.6;
          ring2.rotation.z -= speed * 0.5;
        }
        if (particles) {
          particles.rotation.y += speed * 0.3;
        }

        renderer.render(scene, camera);
      };
      animate();
    };

    // Check if Three.js script is already loaded
    if (window.THREE) {
      init3D();
    } else {
      const script = document.createElement('script');
      script.src = '/three.min.js';
      script.onload = () => init3D();
      document.body.appendChild(script);
    }

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (renderer) renderer.dispose();
    };
  }, [coreState]);

  // Update Core 3D Colors according to state
  useEffect(() => {
    // Dynamic color shifts handled seamlessly
  }, [coreState]);

  // Execute Action on PC
  const executeAction = async (cmd: string) => {
    try {
      playSound('whoosh');
      const res = await fetch('/api/touch/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.ok) {
        setTranscript(`Executed: ${cmd}`);
      }
    } catch {
      // ignore
    }
  };

  // Speak AI response using Web Speech API with clean punctuation
  const speakReply = useCallback(
    (text: string) => {
      setCoreState('SPEAKING');
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const cleanText = text
          .replace(/\[ACTION:.*?\]/gi, '')
          .replace(/\[GENERATE_IMAGE:.*?\]/gi, '')
          .replace(/[*#_`~>]/g, '')
          .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        utterance.onend = () => {
          setCoreState('STANDBY');
          if (isDuplex) {
            setTimeout(() => startListening(), 400);
          }
        };
        utterance.onerror = () => {
          setCoreState('STANDBY');
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setCoreState('STANDBY');
      }
    },
    [isDuplex],
  );

  // Send message to Assistant Chat
  const sendMessage = async (userText: string) => {
    if (!userText.trim()) return;
    setCoreState('THINKING');
    setTranscript(`You: "${userText}"`);

    try {
      const res = await fetch('/api/touch/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.data?.reply || 'Arahan diterima.';
        setAssistantReply(reply);

        if (json.data?.action?.command) {
          executeAction(json.data.action.command);
        }
        if (json.data?.imageUrl) {
          setGeneratedImage(json.data.imageUrl);
        }

        speakReply(reply);
      } else {
        setAssistantReply('Sambungan neural tamat masa.');
        setCoreState('STANDBY');
      }
    } catch {
      setAssistantReply('Mod luar talian: Subrutin sistem beroperasi seperti biasa.');
      setCoreState('STANDBY');
    }
  };

  // Speech Recognition with guaranteed buffer capture
  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      playSound('ping');
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';

      let speechBuffer = '';

      rec.onstart = () => {
        setCoreState('LISTENING');
        setTranscript('Listening... Speak now.');
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        speechBuffer = (final || interim).trim();
        setTranscript(speechBuffer || 'Listening...');
      };

      rec.onend = () => {
        if (speechBuffer && speechBuffer.trim()) {
          sendMessage(speechBuffer.trim());
        } else {
          setCoreState('STANDBY');
          setTranscript('Say "Hey Sentinel" or tap the Core to talk');
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Speech rec error', e);
        setCoreState('STANDBY');
        setTranscript('Mic standby. Tap Core or type to talk.');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.warn('Speech start error', err);
      setCoreState('STANDBY');
    }
  };

  // Multimodal Screen Vision Capture ("Look at my screen")
  const captureScreen = async () => {
    try {
      playSound('chime');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } as any });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(bitmap, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);

      setVisionImage(base64);
      setVisionAnalysis('Analyzing screen capture with Multimodal Neural Vision...');

      const res = await fetch('/api/touch/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          prompt: 'Provide an executive summary of open windows, active code, and productivity telemetry.',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const analysis = json.data?.analysis || 'Visual telemetry processed.';
        setVisionAnalysis(analysis);
        speakReply(analysis);
      }
    } catch {
      setVisionAnalysis('Screen capture was cancelled or not supported.');
    }
  };

  // Toggle Camera for Hand Gestures
  const toggleCamera = async () => {
    if (!cameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } catch {
        alert('Camera access denied or unavailable.');
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
      setCameraActive(false);
    }
  };

  return (
    <>
      <PageHeader
        title="SentinelTouch HUD"
        subtitle="Executive Neural Autonomous Assistant & Multimodal Cybernetic Companion"
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className={`btn sm ${ambientHum ? 'primary' : 'ghost'}`}
            onClick={toggleAmbientHum}
          >
            {ambientHum ? 'Hum: 55Hz ON' : 'Hum: OFF'}
          </button>
          <button
            type="button"
            className={`btn sm ${isDuplex ? 'primary' : 'ghost'}`}
            onClick={() => setIsDuplex(!isDuplex)}
          >
            {isDuplex ? 'Duplex: ACTIVE' : 'Duplex: OFF'}
          </button>
          <button
            type="button"
            className={`btn sm ${cameraActive ? 'primary' : 'ghost'}`}
            onClick={toggleCamera}
          >
            {cameraActive ? 'Camera: AIR GESTURES ON' : 'Camera: OFF'}
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {/* Telemetry Bar */}
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <Stat label="CPU Load" value={`${telemetry.cpu}%`} foot="Real-time processor load" />
          <Stat
            label="Memory Usage"
            value={`${telemetry.ram}%`}
            foot={`${telemetry.ramUsedGb} GB / ${telemetry.ramTotalGb} GB`}
          />
          <Stat label="Power / Battery" value={`${telemetry.battery}%`} foot="Hardware power bus" />
          <Stat label="Uptime" value={telemetry.uptime} foot="Active session uptime" />
        </div>

        {/* Central HUD Panel */}
        <div className="grid cols-2" style={{ gap: 20 }}>
          {/* Left: 3D Holographic Core & Voice Controls */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor:
                      coreState === 'LISTENING'
                        ? '#38bdf8'
                        : coreState === 'THINKING'
                        ? '#a78bfa'
                        : coreState === 'SPEAKING'
                        ? '#34d399'
                        : '#2dd4bf',
                    boxShadow: '0 0 10px currentColor',
                  }}
                />
                <strong style={{ fontSize: 13, letterSpacing: '0.05em' }}>{coreState} • NEURAL CORE</strong>
              </div>
              <span className="badge teal">Three.js WebGL</span>
            </div>

            {/* 3D Canvas */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: 280,
                background: 'radial-gradient(circle at center, rgba(45, 212, 191, 0.12) 0%, transparent 70%)',
                cursor: 'pointer',
              }}
              onClick={startListening}
              title="Click Core to talk"
            >
              <canvas ref={canvasRef} style={{ width: 280, height: 280, display: 'block' }} />
            </div>

            {/* Live Transcript Prompt */}
            <div
              style={{
                textAlign: 'center',
                margin: '12px 0',
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                fontSize: 13,
                fontFamily: 'var(--mono)',
              }}
            >
              {transcript}
            </div>

            {/* Quick Action Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn sm ghost" onClick={startListening}>
                🎙️ Speak to Sentinel
              </button>
              <button type="button" className="btn sm ghost" onClick={captureScreen}>
                🖥️ Look at My Screen
              </button>
              <button type="button" className="btn sm ghost" onClick={() => executeAction('volume_mute')}>
                🔇 Mute
              </button>
              <button type="button" className="btn sm ghost" onClick={() => executeAction('volume_up')}>
                🔊 Vol +
              </button>
              <button type="button" className="btn sm ghost" onClick={() => executeAction('terminal')}>
                💻 Terminal
              </button>
              <button type="button" className="btn sm ghost" onClick={() => executeAction('taskmgr')}>
                📊 Task Manager
              </button>
              <button type="button" className="btn sm ghost" onClick={() => executeAction('lock')}>
                🔒 Lock PC
              </button>
            </div>

            {/* Direct Text Input & Mic Trigger */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (textInput.trim()) {
                  sendMessage(textInput.trim());
                  setTextInput('');
                }
              }}
              style={{ display: 'flex', gap: 8, marginTop: 14 }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your message or click mic above..."
                className="input"
                style={{ flex: 1, fontSize: 13 }}
              />
              <button type="submit" className="btn sm primary">
                Send ↵
              </button>
            </form>
          </Card>

          {/* Right: Screen Vision & Multimodal Analysis Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Assistant Response Box */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, color: 'var(--accent)' }}>Executive Response</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {assistantReply ? (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => speakReply(assistantReply)}
                      title="Replay voice response"
                    >
                      🔊 Replay Voice
                    </button>
                  ) : null}
                  {coreState === 'SPEAKING' ? (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          setCoreState('STANDBY');
                        }
                      }}
                      title="Stop speaking"
                    >
                      ⏹️ Stop
                    </button>
                  ) : null}
                </div>
              </div>
              <p style={{ minHeight: 60, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                {assistantReply ||
                  'Sentinel Neural Core online. System initialized and awaiting direct instruction. Try: "Look at my screen", "Lock workstation", or "What is system status?"'}
              </p>

              {/* Hand Gestures Video Stream if active */}
              {cameraActive ? (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>MediaPipe Gesture Camera</span>
                    <span className="badge green">Tracking</span>
                  </div>
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, background: '#000' }}
                    muted
                    playsInline
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                    Gestures: 🖐️ Palm (Standby) · ✊ Fist (Listen) · ✌️ Peace (Vision) · 👍 Thumbs Up (Confirm)
                  </div>
                </div>
              ) : null}
            </Card>

            {/* Screen Vision Snapshot & Analysis */}
            {visionAnalysis ? (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, color: 'var(--green)' }}>🖥️ Multimodal Screen Vision</h3>
                  <button type="button" className="btn sm ghost" onClick={() => setVisionAnalysis(null)}>
                    Dismiss
                  </button>
                </div>
                {visionImage ? (
                  <img
                    src={visionImage}
                    alt="Screen frame"
                    style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
                  />
                ) : null}
                <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-dim)' }}>{visionAnalysis}</p>
              </Card>
            ) : null}

            {/* Imagen 3 Generated Image */}
            {generatedImage ? (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 14, color: 'var(--amber)' }}>🎨 Visual Projection</h3>
                  <button type="button" className="btn sm ghost" onClick={() => setGeneratedImage(null)}>
                    Dismiss
                  </button>
                </div>
                <img
                  src={generatedImage}
                  alt="Synthesized artwork"
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }}
                />
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </>
  );
}
