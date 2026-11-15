import type { Metadata } from 'next';
import EmbeddedFrame from '@/components/EmbeddedFrame';

export const metadata: Metadata = {
  title: 'Sentinel CTF — Sentinel Hub',
  description: 'Cybersecurity Arena & Challenge Solver',
};

export default function CtfPage() {
  return (
    <EmbeddedFrame
      title="Sentinel CTF"
      subtitle="Cybersecurity Arena & Toolkit"
      port={8023}
      src="https://ctf.sentinelai.studio"
      externalUrl="https://ctf.sentinelai.studio"
    />
  );
}
