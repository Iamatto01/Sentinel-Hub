import { guard } from '@/lib/guard';
import { ok, fail } from '@/lib/http';
import { scanProjects } from '@/lib/projects';

export type RepoCluster = 'core' | 'ai_agents' | 'web3_contract' | 'media_creative' | 'kali_ops' | 'utilities';

export interface GodViewNode {
  id: string;
  name: string;
  path: string;
  kind: string;
  cluster: RepoCluster;
  isRepo: boolean;
  branch: string | null;
  changedFiles: number;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
  totalBytes: number;
  status: 'healthy' | 'dirty' | 'unpushed' | 'untracked';
  dependencies: string[];
}

function assignCluster(name: string, kind: string): RepoCluster {
  const n = name.toLowerCase();
  if (n.includes('master') || n.includes('hub') || n === 'sentinelai' || n === 'fyp2project') return 'core';
  if (n.includes('contract') || n.includes('hardhat') || n.includes('gelatin')) return 'web3_contract';
  if (n.includes('touch') || n.includes('autobot') || n.includes('bot') || n.includes('bonsai')) return 'ai_agents';
  if (n.includes('media') || n.includes('story') || n.includes('fashion') || n.includes('cute')) return 'media_creative';
  if (n.includes('kali') || n.includes('ctf') || n.includes('threat') || n.includes('fame')) return 'kali_ops';
  return 'utilities';
}

export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  try {
    const scan = await scanProjects();
    const nodes: GodViewNode[] = scan.projects.map((p) => {
      let status: GodViewNode['status'] = 'healthy';
      if (p.git.changedFiles > 0) status = 'dirty';
      else if (p.git.ahead > 0) status = 'unpushed';
      else if (!p.git.isRepo) status = 'untracked';

      return {
        id: p.name,
        name: p.name,
        path: p.path,
        kind: p.kind,
        cluster: assignCluster(p.name, p.kind),
        isRepo: p.git.isRepo,
        branch: p.git.branch,
        changedFiles: p.git.changedFiles,
        ahead: p.git.ahead,
        behind: p.git.behind,
        remoteUrl: p.git.remoteUrl,
        totalBytes: p.totalBytes,
        status,
        dependencies: p.scripts.slice(0, 4),
      };
    });

    const clustersSummary = {
      core: nodes.filter((n) => n.cluster === 'core').length,
      ai_agents: nodes.filter((n) => n.cluster === 'ai_agents').length,
      web3_contract: nodes.filter((n) => n.cluster === 'web3_contract').length,
      media_creative: nodes.filter((n) => n.cluster === 'media_creative').length,
      kali_ops: nodes.filter((n) => n.cluster === 'kali_ops').length,
      utilities: nodes.filter((n) => n.cluster === 'utilities').length,
    };

    return ok({
      data: {
        root: scan.root,
        scannedAt: scan.scannedAt,
        totalCount: nodes.length,
        gitCount: scan.totals.gitRepos,
        dirtyCount: scan.totals.dirty,
        nodes,
        clustersSummary,
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'God view scan failed');
  }
}
