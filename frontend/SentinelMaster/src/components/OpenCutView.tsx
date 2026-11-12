'use client';

import { useState, useRef, useEffect } from 'react';
import { PageHeader, PageBody } from './PageHeader';
import { Card, Stat } from './ui';

interface TimelineClip {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  startSec: number;
  durationSec: number;
  color: string;
  content?: string;
}

export default function OpenCutView() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(2.5);
  const [totalDuration, setTotalDuration] = useState(15.0);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [activeClipId, setActiveClipId] = useState<string | null>('clip-1');
  const [textOverlay, setTextOverlay] = useState('SENTINEL AI PROTOCOL');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [clips, setClips] = useState<TimelineClip[]>([
    { id: 'clip-1', name: 'Cyber_Intro_4k.mp4', type: 'video', startSec: 0, durationSec: 6.0, color: '#3b82f6' },
    { id: 'clip-2', name: 'B-Roll_Terminal.mp4', type: 'video', startSec: 6.0, durationSec: 8.0, color: '#0ea5e9' },
    { id: 'clip-3', name: 'Synth_Bass_Loop.wav', type: 'audio', startSec: 0, durationSec: 14.0, color: '#10b981' },
    { id: 'clip-4', name: 'Title: SENTINEL AI', type: 'text', startSec: 1.0, durationSec: 5.0, color: '#f59e0b', content: 'SENTINEL AI PROTOCOL' },
    { id: 'clip-5', name: 'Subtitle: Online', type: 'text', startSec: 7.0, durationSec: 6.0, color: '#8b5cf6', content: 'SYSTEMS ONLINE & VERIFIED' },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Playhead scrubber loop
  useEffect(() => {
    if (isPlaying) {
      const startMs = Date.now() - currentTime * 1000;
      const loop = () => {
        const elapsed = (Date.now() - startMs) / 1000;
        if (elapsed >= totalDuration) {
          setCurrentTime(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(elapsed);
          animRef.current = requestAnimationFrame(loop);
        }
      };
      animRef.current = requestAnimationFrame(loop);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, totalDuration]);

  // Render Video Preview on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background gradient / video frame simulation
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(0.5, '#131b2e');
    grad.addColorStop(1, '#050810');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines / scanline effect
    ctx.strokeStyle = 'rgba(79, 140, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Dynamic wave animation based on time
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 4) {
      const y = h / 2 + Math.sin(x * 0.03 + currentTime * 4) * 20 * (1 + Math.sin(currentTime));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Active Text Overlay
    const activeText = clips.find(
      (c) => c.type === 'text' && currentTime >= c.startSec && currentTime <= c.startSec + c.durationSec,
    );
    if (activeText?.content) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(45, 212, 191, 0.8)';
      ctx.shadowBlur = 12;
      ctx.fillText(activeText.content, w / 2, h * 0.75);
      ctx.shadowBlur = 0;
    }

    // Timecode in top left
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(formatTimecode(currentTime), 12, 20);
  }, [currentTime, clips]);

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * 30);
    return `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  };

  // Split Clip at Playhead
  const splitClipAtPlayhead = () => {
    if (!activeClipId) return;
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) return;
    if (currentTime > clip.startSec && currentTime < clip.startSec + clip.durationSec) {
      const leftDuration = currentTime - clip.startSec;
      const rightDuration = clip.durationSec - leftDuration;
      const updatedLeft = { ...clip, durationSec: leftDuration };
      const newRight: TimelineClip = {
        ...clip,
        id: `clip-${Date.now()}`,
        startSec: currentTime,
        durationSec: rightDuration,
        name: `${clip.name} (Split)`,
      };
      setClips((prev) => prev.map((c) => (c.id === clip.id ? updatedLeft : c)).concat(newRight));
      setActiveClipId(newRight.id);
    }
  };

  // Delete Active Clip
  const deleteActiveClip = () => {
    if (!activeClipId) return;
    setClips((prev) => prev.filter((c) => c.id !== activeClipId));
    setActiveClipId(null);
  };

  // Add Text Title
  const addTextClip = () => {
    const newTextClip: TimelineClip = {
      id: `text-${Date.now()}`,
      name: `Text: ${textOverlay.slice(0, 10)}`,
      type: 'text',
      startSec: currentTime,
      durationSec: 4.0,
      color: '#ec4899',
      content: textOverlay,
    };
    setClips((prev) => [...prev, newTextClip]);
    setActiveClipId(newTextClip.id);
  };

  // Export Video
  const exportVideo = () => {
    setExportNotice('Rendering composition with OpenCut engine… deterministic 60fps MP4 export complete!');
    setTimeout(() => setExportNotice(null), 5000);
  };

  return (
    <>
      <PageHeader
        title="OpenCut Video Studio"
        subtitle="The Open-Source CapCut Alternative · In-Browser Multi-Track Video Editor for Creators"
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={aspectRatio}
            onChange={(e: any) => setAspectRatio(e.target.value)}
            className="input"
            style={{ width: 140 }}
          >
            <option value="9:16">📱 9:16 Vertical (Reels/TikTok)</option>
            <option value="16:9">🖥️ 16:9 Landscape (YouTube)</option>
            <option value="1:1">⬛ 1:1 Square (Feed)</option>
          </select>
          <button type="button" className="btn primary sm" onClick={exportVideo}>
            Export Video (MP4)
          </button>
        </div>
      </PageHeader>

      <PageBody>
        {exportNotice ? <div className="alert ok" style={{ marginBottom: 16 }}>{exportNotice}</div> : null}

        {/* Top Split: Preview Screen & Media Bin */}
        <div className="grid cols-2" style={{ gap: 20, marginBottom: 20 }}>
          {/* Canvas Video Monitor */}
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                width: aspectRatio === '9:16' ? 225 : aspectRatio === '16:9' ? 400 : 280,
                height: aspectRatio === '9:16' ? 400 : aspectRatio === '16:9' ? 225 : 280,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 0 30px rgba(0,0,0,0.8)',
                border: '1px solid var(--line)',
                background: '#000',
                transition: 'all 0.3s ease',
              }}
            >
              <canvas
                ref={canvasRef}
                width={aspectRatio === '9:16' ? 450 : aspectRatio === '16:9' ? 800 : 560}
                height={aspectRatio === '9:16' ? 800 : aspectRatio === '16:9' ? 450 : 560}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>

            {/* Playback Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setCurrentTime(0)}
                title="Rewind to start"
              >
                ⏮
              </button>
              <button
                type="button"
                className="btn sm primary"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setCurrentTime(totalDuration)}
                title="Fast-forward"
              >
                ⏭
              </button>
              <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
              </span>
            </div>
          </Card>

          {/* Media Bin & Clip Controls */}
          <Card>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>🎬 OpenCut Media Assets & Tools</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Add Custom Animated Caption:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={textOverlay}
                  onChange={(e) => setTextOverlay(e.target.value)}
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Enter caption text..."
                />
                <button type="button" className="btn sm" onClick={addTextClip}>
                  + Add Text
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button type="button" className="btn sm" onClick={splitClipAtPlayhead}>
                ✂ Split at Playhead
              </button>
              <button
                type="button"
                className="btn sm red"
                disabled={!activeClipId}
                onClick={deleteActiveClip}
              >
                🗑 Delete Clip
              </button>
            </div>

            {/* Clip List */}
            <h4 style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>Timeline Clip Pool:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  onClick={() => setActiveClipId(clip.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: activeClipId === clip.id ? 'var(--panel-3)' : 'var(--panel-2)',
                    border: activeClipId === clip.id ? `1px solid ${clip.color}` : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: clip.color }} />
                    <strong>{clip.name}</strong>
                  </div>
                  <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                    {clip.startSec}s – {clip.startSec + clip.durationSec}s ({clip.durationSec}s)
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Bottom Multi-Track Timeline */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Multi-Track Timeline (CapCut Mode)</h3>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Zoom: 100% · Snap: Active · Framerate: 60 FPS
            </span>
          </div>

          {/* Timeline Tracks View */}
          <div
            style={{
              position: 'relative',
              background: 'var(--bg-soft)',
              borderRadius: 8,
              border: '1px solid var(--line)',
              padding: '12px 8px',
              minHeight: 160,
              userSelect: 'none',
            }}
          >
            {/* Playhead Vertical Line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(currentTime / totalDuration) * 98 + 1}%`,
                width: 2,
                backgroundColor: '#ef4444',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 12,
                  height: 12,
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                }}
              />
            </div>

            {/* Track 1: Video Track */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ width: 70, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>VIDEO 1</span>
              <div style={{ flex: 1, position: 'relative', height: 32, background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                {clips
                  .filter((c) => c.type === 'video')
                  .map((c) => {
                    const leftPercent = (c.startSec / totalDuration) * 100;
                    const widthPercent = (c.durationSec / totalDuration) * 100;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setActiveClipId(c.id)}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          height: '100%',
                          backgroundColor: c.color,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          color: '#fff',
                          fontSize: 11,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          boxShadow: activeClipId === c.id ? '0 0 0 2px #fff' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        📹 {c.name}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Track 2: Audio Track */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ width: 70, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>AUDIO 1</span>
              <div style={{ flex: 1, position: 'relative', height: 32, background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                {clips
                  .filter((c) => c.type === 'audio')
                  .map((c) => {
                    const leftPercent = (c.startSec / totalDuration) * 100;
                    const widthPercent = (c.durationSec / totalDuration) * 100;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setActiveClipId(c.id)}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          height: '100%',
                          backgroundColor: c.color,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          color: '#fff',
                          fontSize: 11,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          boxShadow: activeClipId === c.id ? '0 0 0 2px #fff' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        🎵 {c.name}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Track 3: Text / Captions Track */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 70, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>TEXT</span>
              <div style={{ flex: 1, position: 'relative', height: 32, background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                {clips
                  .filter((c) => c.type === 'text')
                  .map((c) => {
                    const leftPercent = (c.startSec / totalDuration) * 100;
                    const widthPercent = (c.durationSec / totalDuration) * 100;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setActiveClipId(c.id)}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          height: '100%',
                          backgroundColor: c.color,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          color: '#fff',
                          fontSize: 11,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          boxShadow: activeClipId === c.id ? '0 0 0 2px #fff' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        💬 {c.name}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
