import type { Metadata } from 'next';
import GithubView from '@/components/GithubView';

export const metadata: Metadata = {
  title: 'GitHub',
  robots: { index: false, follow: false },
};

export default function GithubPage() {
  return <GithubView />;
}
