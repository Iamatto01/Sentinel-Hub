import type { Metadata } from 'next';
import EmbeddedFrame from '@/components/EmbeddedFrame';

export const metadata: Metadata = {
  title: 'SentinelAI Platform — Sentinel Hub',
  description: 'Core Sentinel AI Platform Portal',
};

export default function SentinelAIPage() {
  return (
    <EmbeddedFrame
      title="SentinelAI Platform"
      subtitle="Core Vulnerability & Analysis Portal"
      port={5173}
      src="https://sentinelai.studio"
      externalUrl="https://sentinelai.studio"
    />
  );
}
