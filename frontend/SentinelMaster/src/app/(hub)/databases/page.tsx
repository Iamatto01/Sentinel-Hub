import { Suspense } from 'react';
import type { Metadata } from 'next';
import DatabasesView from '@/components/DatabasesView';
import { Loading } from '@/components/ui';

export const metadata: Metadata = { title: 'Databases — Sentinel Hub' };

export default function DatabasesPage() {
  // `DatabasesView` reads `?db=` and `?compare=` to honour worklist deep links,
  // and `useSearchParams` requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<Loading label="Opening the database registry…" />}>
      <DatabasesView />
    </Suspense>
  );
}
