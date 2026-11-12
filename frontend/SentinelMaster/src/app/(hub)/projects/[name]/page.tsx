import type { Metadata } from 'next';
import ProjectDetailView from '@/components/ProjectDetailView';

export const metadata: Metadata = {
  title: 'Project',
  robots: { index: false, follow: false },
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <ProjectDetailView name={name} />;
}
