import type { Metadata } from 'next';
import FameView from '@/components/FameView';

export const metadata: Metadata = {
  title: 'SentinelFame',
  robots: { index: false, follow: false },
};

export default function FamePage() {
  return <FameView />;
}
