import type { Metadata } from 'next';
import HyperFramesView from '@/components/HyperFramesView';

export const metadata: Metadata = { title: 'HyperFrames Agent Video Engine' };

export default function HyperFramesPage() {
  return <HyperFramesView />;
}
