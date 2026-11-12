import type { Metadata } from 'next';
import SentinelTouchView from '@/components/SentinelTouchView';

export const metadata: Metadata = { title: 'SentinelTouch HUD' };

export default function TouchPage() {
  return <SentinelTouchView />;
}
