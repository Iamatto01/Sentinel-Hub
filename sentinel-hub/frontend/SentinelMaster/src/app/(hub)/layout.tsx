import type { ReactNode } from 'react';
import { HubShell } from '@/components/HubShell';

/**
 * Shell for every authenticated surface. `proxy.ts` has already verified the
 * session cookie before this renders — the layout only supplies chrome.
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  return <HubShell>{children}</HubShell>;
}

