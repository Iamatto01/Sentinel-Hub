import type { Metadata } from 'next';
import HermesView from '@/components/HermesView';

export const metadata: Metadata = {
  title: 'Hermes Agent AI — Sentinel Hub',
};

export default function HermesPage() {
  return <HermesView />;
}
