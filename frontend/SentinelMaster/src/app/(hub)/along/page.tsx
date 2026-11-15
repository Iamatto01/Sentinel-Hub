import type { Metadata } from 'next';
import EmbeddedFrame from '@/components/EmbeddedFrame';

export const metadata: Metadata = {
  title: 'SentinelAlong — Sentinel Hub',
  description: 'Minimalist CAD & Floorplan Sketcher',
};

export default function AlongPage() {
  return (
    <EmbeddedFrame
      title="SentinelAlong"
      subtitle="Floorplan & CAD Room Sketcher"
      port={8028}
      src="https://along.sentinelai.studio"
      externalUrl="https://along.sentinelai.studio"
    />
  );
}
