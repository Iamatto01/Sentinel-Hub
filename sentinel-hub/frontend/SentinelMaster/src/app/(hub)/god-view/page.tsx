import type { Metadata } from 'next';
import GodViewRepoView from '@/components/GodViewRepoView';

export const metadata: Metadata = { title: 'God View Repo' };

export default function GodViewPage() {
  return <GodViewRepoView />;
}
