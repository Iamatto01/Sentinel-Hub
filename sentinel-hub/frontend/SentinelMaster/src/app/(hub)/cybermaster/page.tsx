import type { Metadata } from 'next';
import CyberMasterView from '@/components/CyberMasterView';

export const metadata: Metadata = { title: 'CyberMaster Bot' };

export default function CyberMasterPage() {
  return <CyberMasterView />;
}
