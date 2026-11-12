import type { Metadata } from 'next';
import RouterView from '@/components/RouterView';

export const metadata: Metadata = { title: 'Sentinel AI Gateway — Sentinel Hub' };

export default function RouterPage() {
  return <RouterView />;
}
