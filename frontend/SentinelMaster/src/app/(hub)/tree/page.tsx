import type { Metadata } from 'next';
import EmbeddedFrame from '@/components/EmbeddedFrame';

export const metadata: Metadata = {
  title: 'SentinelTree — Sentinel Hub',
  description: 'Salasilah Warisan Jamal Awang Family Tree',
};

export default function TreePage() {
  return (
    <EmbeddedFrame
      title="SentinelTree"
      subtitle="Salasilah Warisan Jamal Awang (93 Ahli)"
      port={8007}
      src="https://tree.sentinelai.studio"
      externalUrl="https://tree.sentinelai.studio"
    />
  );
}
