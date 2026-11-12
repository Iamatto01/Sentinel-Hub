import type { Metadata } from 'next';
import GrokBotView from '@/components/GrokBotView';

export const metadata: Metadata = { title: 'Grok Bot Hub' };

export default function GrokBotPage() {
  return <GrokBotView />;
}
