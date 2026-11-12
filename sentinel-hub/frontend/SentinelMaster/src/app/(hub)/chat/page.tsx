import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Antigravity Chat — Sentinel Hub',
  description: 'Minimalist Black & White AI Chat Console with multi-project organization',
};

export default function ChatPage() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 4px)', display: 'flex', flexDirection: 'column', background: '#090a0c' }}>
      <iframe
        src="/chat.html"
        title="Antigravity AI Console"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#090a0c',
        }}
      />
    </div>
  );
}
