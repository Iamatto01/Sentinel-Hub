import type { Metadata } from 'next';
import OpenCutView from '@/components/OpenCutView';

export const metadata: Metadata = { title: 'OpenCut Video Studio' };

export default function OpenCutPage() {
  return <OpenCutView />;
}
