import type { Metadata } from 'next';
import { Suspense } from 'react';
import KaliServerView from '@/components/KaliServerView';

export const metadata: Metadata = { title: 'Server Management — Sentinel Hub' };

export default function KaliPage() {
  return (
    <Suspense fallback={null}>
      <KaliServerView />
    </Suspense>
  );
}
