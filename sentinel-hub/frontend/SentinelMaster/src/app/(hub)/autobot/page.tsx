import type { Metadata } from 'next';
import AutobotView from '@/components/AutobotView';

export const metadata: Metadata = {
  title: 'Autobot',
  robots: { index: false, follow: false },
};

export default function AutobotPage() {
  return <AutobotView />;
}
