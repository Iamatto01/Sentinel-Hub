import type { Metadata } from 'next';
import EmbeddedFrame from '@/components/EmbeddedFrame';

export const metadata: Metadata = {
  title: 'Sentinel MLBB — Sentinel Hub',
  description: 'Mobile Legends Tournament & Bot Platform',
};

export default function MLBBPage() {
  return (
    <EmbeddedFrame
      title="Sentinel MLBB"
      subtitle="Tournament Platform & Game Logs"
      port={3005}
      src="https://mlbb.sentinelai.studio"
      externalUrl="https://mlbb.sentinelai.studio"
    />
  );
}
