'use client';

import { useState, useRef } from 'react';

interface EmbeddedFrameProps {
  title: string;
  subtitle?: string;
  port?: number | string;
  src: string;
  externalUrl?: string;
}

export default function EmbeddedFrame({
  title,
  subtitle,
  port,
  src,
  externalUrl,
}: EmbeddedFrameProps) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reload = () => {
    if (iframeRef.current) {
      setLoading(true);
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const targetUrl = externalUrl || src;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 2px)',
        width: '100%',
        background: 'var(--bg)',
      }}
    >
      {/* Sleek Subbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--panel)',
          borderBottom: '1px solid var(--line)',
          backdropFilter: 'blur(16px)',
          fontSize: '12px',
          color: 'var(--text-dim)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: '13px' }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ color: 'var(--text-faint)' }}>— {subtitle}</span>
          )}
          {port && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                padding: '1px 7px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#34d399',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span className="pulse-dot green" style={{ width: '5px', height: '5px' }} />
              Port {port}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              Memuatkan...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={reload}
            className="btn sm ghost"
            style={{
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11.5px',
              color: 'var(--text-dim)',
            }}
            title="Muat semula paparan"
          >
            🔄 Muat Semula
          </button>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn sm ghost"
            style={{
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11.5px',
              color: 'var(--text-dim)',
            }}
          >
            Buka Tab Asing ↗
          </a>
        </div>
      </div>

      {/* Frame */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          onLoad={() => setLoading(false)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: 'var(--bg)',
          }}
          allow="clipboard-write; fullscreen; camera; microphone"
        />
      </div>
    </div>
  );
}
