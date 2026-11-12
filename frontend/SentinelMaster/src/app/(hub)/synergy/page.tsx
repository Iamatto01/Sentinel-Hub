import type { Metadata } from 'next';
import SynergyMeshView from '@/components/SynergyMeshView';

export const metadata: Metadata = { title: 'Synergy Mesh' };

export default function SynergyPage() {
  return <SynergyMeshView />;
}
