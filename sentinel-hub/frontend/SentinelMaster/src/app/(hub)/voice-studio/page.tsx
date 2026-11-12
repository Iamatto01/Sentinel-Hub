import type { Metadata } from 'next';
import VoiceStudioView from '@/components/VoiceStudioView';

export const metadata: Metadata = { title: 'Voice Studio' };

export default function VoiceStudioPage() {
  return <VoiceStudioView />;
}
