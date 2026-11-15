'use client';

import React from 'react';

export type FrierenMood = 'calm' | 'analyzing' | 'focused' | 'casting';

interface FrierenAvatarProps {
  size?: number | string;
  mood?: FrierenMood;
  glow?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function FrierenAvatar({
  size = 140,
  mood = 'calm',
  glow = true,
  className = '',
  onClick,
}: FrierenAvatarProps) {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  // Mood aura accent
  const glowColors: Record<FrierenMood, string> = {
    calm: 'rgba(167, 139, 250, 0.35)',
    analyzing: 'rgba(56, 189, 248, 0.45)',
    focused: 'rgba(52, 211, 153, 0.45)',
    casting: 'rgba(236, 72, 153, 0.55)',
  };

  const glowColor = glowColors[mood];

  return (
    <div
      className={`frieren-avatar-wrapper ${className}`}
      onClick={onClick}
      style={{
        position: 'relative',
        width: pixelSize,
        height: pixelSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* Dynamic Magical Aura Background */}
      {glow && (
        <div
          style={{
            position: 'absolute',
            inset: '10%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor} 0%, rgba(0,0,0,0) 70%)`,
            filter: 'blur(16px)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 0.5s ease',
          }}
        />
      )}

      {/* Embedded SVG with built-in micro-animations */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 160"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          filter: glow ? `drop-shadow(0 4px 14px ${glowColor})` : undefined,
        }}
      >
        <style>{`
          @keyframes frieren-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          @keyframes frieren-blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
          @keyframes frieren-hair-sway {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(2deg); }
          }
          @keyframes frieren-sparkle {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes frieren-staff-glow {
            0%, 100% { filter: drop-shadow(0 0 3px #a78bfa); }
            50% { filter: drop-shadow(0 0 10px #c4b5fd); }
          }
          .frieren-body-g { animation: frieren-float 3.5s ease-in-out infinite; }
          .frieren-eye-l { transform-origin: 70px 50px; animation: frieren-blink 4.2s ease-in-out infinite; }
          .frieren-eye-r { transform-origin: 90px 50px; animation: frieren-blink 4.2s ease-in-out infinite 0.15s; }
          .frieren-hair-strands { animation: frieren-hair-sway 4s ease-in-out infinite; transform-origin: 80px 30px; }
          .frieren-sp1 { animation: frieren-sparkle 2.2s ease-in-out infinite; }
          .frieren-sp2 { animation: frieren-sparkle 2.8s ease-in-out infinite 0.8s; }
          .frieren-sp3 { animation: frieren-sparkle 3.2s ease-in-out infinite 1.4s; }
          .frieren-staff-g { animation: frieren-staff-glow 3s ease-in-out infinite; }
        `}</style>

        <g className="frieren-body-g">
          {/* Ground soft shadow */}
          <ellipse cx="80" cy="152" rx="25" ry="5" fill="rgba(0,0,0,0.25)" />

          {/* Magic Staff */}
          <g className="frieren-staff-g">
            <line x1="115" y1="45" x2="120" y2="145" stroke="#8b7355" strokeWidth="3" strokeLinecap="round" />
            <circle cx="114" cy="42" r="6" fill="none" stroke="#a78bfa" strokeWidth="2" />
            <circle cx="114" cy="42" r="2.8" fill="#c4b5fd" />
          </g>

          {/* White & Gold Robe */}
          <path
            d="M55,85 Q55,75 65,72 L95,72 Q105,75 105,85 L108,140 Q108,148 80,148 Q52,148 52,140 Z"
            fill="#f5f0ff"
            stroke="#d8d0e8"
            strokeWidth="1"
          />
          {/* Robe details front pleats */}
          <path d="M78,75 L76,148" stroke="#e8e0f0" strokeWidth="1" fill="none" />
          <path d="M82,75 L84,148" stroke="#e8e0f0" strokeWidth="1" fill="none" />
          <path d="M60,85 Q80,90 100,85" stroke="#9b8ec4" strokeWidth="2" fill="none" />

          {/* Sleeves */}
          <path d="M55,82 Q40,95 42,110 Q45,112 50,108 Q52,95 60,85" fill="#f5f0ff" stroke="#d8d0e8" strokeWidth="1" />
          <path d="M105,82 Q118,95 116,110 Q113,112 108,108 Q106,95 100,85" fill="#f5f0ff" stroke="#d8d0e8" strokeWidth="1" />

          {/* Hands */}
          <circle cx="46" cy="108" r="4" fill="#fce4d6" />
          <circle cx="112" cy="108" r="4" fill="#fce4d6" />

          {/* Neck */}
          <rect x="74" y="65" width="12" height="8" rx="2" fill="#fce4d6" />

          {/* Head */}
          <ellipse cx="80" cy="48" rx="26" ry="22" fill="#fce4d6" />

          {/* Hair back */}
          <path d="M54,48 Q50,20 65,15 Q80,8 95,15 Q110,20 106,48" fill="#c0c8d8" />

          {/* Hair front bangs */}
          <path d="M56,45 Q58,30 68,28 Q72,35 70,42" fill="#b8c4d8" />
          <path d="M68,42 Q70,28 80,26 Q82,28 80,42" fill="#c0c8d8" />
          <path d="M78,42 Q80,28 90,28 Q94,35 92,42" fill="#b8c4d8" />
          <path d="M90,42 Q94,30 104,45" fill="#c0c8d8" />

          {/* Hair side twin strands */}
          <g className="frieren-hair-strands">
            <path d="M54,48 Q48,65 50,85 Q52,88 54,85 Q55,65 58,50" fill="#c0c8d8" />
            <path d="M106,48 Q112,65 110,85 Q108,88 106,85 Q105,65 102,50" fill="#c0c8d8" />
          </g>

          {/* Long twin tails */}
          <path d="M56,50 Q52,90 55,130 Q58,135 62,130 Q60,90 62,55" fill="#b8c4d8" opacity="0.75" />
          <path d="M104,50 Q108,90 105,130 Q102,135 98,130 Q100,90 98,55" fill="#b8c4d8" opacity="0.75" />

          {/* Elf ears */}
          <path d="M54,45 Q42,38 48,30 Q52,36 56,42" fill="#fce4d6" />
          <path d="M106,45 Q118,38 112,30 Q108,36 104,42" fill="#fce4d6" />
          <path d="M54,45 Q42,38 48,30" fill="none" stroke="#f0c8b0" strokeWidth="0.6" />
          <path d="M106,45 Q118,38 112,30" fill="none" stroke="#f0c8b0" strokeWidth="0.6" />

          {/* Calm eyes with blink animation */}
          <ellipse cx="70" cy="50" rx="3.6" ry="3.6" fill="#7c6fac" className="frieren-eye-l" />
          <ellipse cx="90" cy="50" rx="3.6" ry="3.6" fill="#7c6fac" className="frieren-eye-r" />

          {/* Eye highlights */}
          <circle cx="71.5" cy="48.5" r="1.3" fill="#ffffff" />
          <circle cx="91.5" cy="48.5" r="1.3" fill="#ffffff" />

          {/* Eyebrows */}
          <path d="M64,43 Q70,41 76,43" stroke="#9098a8" strokeWidth="1.2" fill="none" />
          <path d="M84,43 Q90,41 96,43" stroke="#9098a8" strokeWidth="1.2" fill="none" />

          {/* Neutral serene expression */}
          <path d="M76,57 Q80,59 84,57" stroke="#c09898" strokeWidth="1" fill="none" />

          {/* Subtle blush */}
          <ellipse cx="65" cy="55" rx="4" ry="2" fill="#ffb8b8" opacity="0.35" />
          <ellipse cx="95" cy="55" rx="4" ry="2" fill="#ffb8b8" opacity="0.35" />

          {/* Sparkles */}
          <g className="frieren-sp1">
            <path d="M35,70 L37,65 L39,70 L37,75 Z" fill="#c4b5fd" opacity="0.8" />
          </g>
          <g className="frieren-sp2">
            <path d="M125,55 L126.5,51 L128,55 L126.5,59 Z" fill="#a78bfa" opacity="0.7" />
          </g>
          <g className="frieren-sp3">
            <path d="M45,35 L46,32 L47,35 L46,38 Z" fill="#ddd6fe" opacity="0.8" />
          </g>
        </g>
      </svg>
    </div>
  );
}
