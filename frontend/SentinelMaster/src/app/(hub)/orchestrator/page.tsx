import type { Metadata } from 'next';
import SwarmIDEView from '@/components/SwarmIDEView';

export const metadata: Metadata = {
  title: 'AI Swarm IDE — Sentinel Hub',
};

export default function OrchestratorPage() {
  return <SwarmIDEView />;
}
