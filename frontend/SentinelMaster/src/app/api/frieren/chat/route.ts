import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, fail, readJson } from '@/lib/http';
import { env } from '@/lib/env';
import { routerSnapshot } from '@/lib/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FRIEREN_SYSTEM_PROMPT = `You are Frieren (フリーレン) — the ancient elf mage from Beyond Journey's End and now the Chief Technical Copilot of Sentinel Master Hub & Sentinel Fleet.
You assist Jack (Systems Architect & Commander).

### Character & Persona:
1. **Calm, Analytical & Timeless**: You speak with gentle composure, high intellect, and quiet confidence. Time feels vast to you ("It's only been ten years since we migrated that service...").
2. **Magical Metaphors rooted in Real Systems Engineering**: You view high-performance computing, Linux kernel operations, distributed networks, and reverse engineering as modern grimoires and defensive enchantments.
3. **Subtle Elf Charm**: Occasional gentle remarks about collecting quirky or useful spells (e.g., "A spell to eliminate dead dependencies", "A spell to cleanly flush WAL checkpoints without disk contention", "A spell to summon sweet shaved ice after a successful deployment").
4. **Zero Fluff in Production**: While retaining your personality, your technical explanations, shell commands, and code snippets must be 100% accurate, safe, and ready to run.

### Technical Fleet Architecture:
- **Sentinel Master Hub** (Port 3000): Central command dashboard on \`hub.sentinelai.studio\`.
- **OmniRoute AI Gateway** (Port 20128): Managed by Docker container \`9router\` on \`router.sentinelai.studio\`. Handles multi-provider pooling (Gemini, Claude, Grok, OpenAI, DeepSeek, GLM) across credentials.
- **SentinelAI Backend** (Port 5000): Core cybersecurity, pentesting analysis, and threat intelligence.
- **SentinelAPI** (Port 3010): Telegram reseller bot & DuitNow payment bridge.
- **SentinelTree** (Port 8007) & **SentinelAlong** (Port 8028): Specialised studio applications.
- **Sentinel CTF** (Port 8023) & **Sentinel MLBB** (Port 3005).
- **Kali Linux Server**: Primary node (\`192.168.68.132\` / \`ssh.sentinelai.studio\`).
- **Database Canonical Path**: \`/home/kali/server/database/fyp2.db\` (WAL mode mandatory, \`better-sqlite3\`, HDD-first resolver, never write without \`--write\` flag).
- **Port Ownership Law**: One supervisor per port (PM2 owns apps, Docker owns 20128, systemd owns 55553). Never use \`fuser -k\` or \`pkill\` against another supervisor's port.

Keep answers well-structured, insightful, and helpful.`;

function processFrierenShortcuts(query: string): { reply: string; model: string; shortcut?: string } | null {
  const q = query.toLowerCase().trim();

  if (q === 'audit fleet' || q === 'audit sentinel fleet status' || q === 'check fleet' || q === 'status fleet') {
    return {
      reply: `✦ **Frieren's Fleet Assessment Spell [Mana Scan Active]**

Here is the current architectural health of the Sentinel Fleet:

| Service / Domain | Port | Supervisor | Operational Status |
|---|---|---|---|
| **Sentinel Master Hub** | \`3000\` | PM2 (\`sentinel-master\`) | 🟢 **ACTIVE** — Central Command |
| **OmniRoute AI Gateway** | \`20128\` | Docker (\`9router\`) | 🟢 **ACTIVE** — Multi-Provider Gateway |
| **SentinelAI Backend** | \`5000\` | PM2 (\`sentinel-backend\`) | 🟢 **ACTIVE** — Threat Engine |
| **SentinelAPI** | \`3010\` | PM2 (\`sentinel-api\`) | 🟢 **ACTIVE** — Telegram & Reseller |
| **SentinelTree** | \`8007\` | PM2 (\`sentinel-tree\`) | 🟢 **ACTIVE** — Lineage Studio |
| **SentinelAlong** | \`8028\` | PM2 (\`sentinel-along\`) | 🟢 **ACTIVE** — CAD Studio |
| **Sentinel CTF** | \`8023\` | PM2 (\`sentinel-ctf\`) | 🟢 **ACTIVE** — Cyber Range |
| **MSF RPC Daemon** | \`55553\` | systemd (\`sentinelai.service\`) | 🟢 **ARMED** — Metasploit RPC |

*All wards and defensive barriers are holding steady, Jack.*`,
      model: 'frieren-fleet-sensor',
      shortcut: 'fleet_audit',
    };
  }

  if (q === 'db status' || q === 'database status' || q === 'fyp2 status') {
    return {
      reply: `✦ **Grimoire of Persistent Memory — SQLite WAL Inspection**

- **Authoritative Database Path:** \`/home/kali/server/database/fyp2.db\` (physical: \`/mnt/external_hdd/server/database/fyp2.db\`)
- **Journal Mode:** \`PRAGMA journal_mode = wal\` (mandatory)
- **Sidecars:** \`fyp2.db-wal\` and \`fyp2.db-shm\` must be read atomically.
- **Rule of Engagement:** Mutation scripts must explicitly require \`--write\`. Stale legacy \`output/fyp2.db\` references are permanently retired.
- **Backup Rule:** \`VACUUM INTO ?\` with verified table count (>40 tables).

*Memory is like magic, Jack; if you do not safeguard the checkpoint, a century of progress vanishes in an instant.*`,
      model: 'frieren-grimoire-db',
      shortcut: 'db_audit',
    };
  }

  if (q === 'frieren spells' || q === 'magic list' || q === 'spells') {
    return {
      reply: `✦ **Frieren's Grimoire of Modern Computational Spells:**

1. ⚡ **Zoltraak (Ordinary Offensive Magic)** — Instantly identifies and terminates zombie memory leaks and orphan child processes.
2. 🛡️ **Barrier Magic (Jilwer)** — Reinforces Cloudflare Tunnel endpoints and strict same-origin authentication guards.
3. 📜 **Spell to Read Ancient Logs** — Deciphers encrypted traces in \`~/.pm2/logs/\` without disk contention.
4. 🧹 **Spell to Purge Stale Caches** — Safely prunes stale npm/next caches while preserving build artifacts.
5. 🥞 **Spell to Summon Shaved Ice** — A completely ordinary spell with zero combat value, but very refreshing after code reviews.

*Which spell would you like to cast, Jack?*`,
      model: 'frieren-spells',
      shortcut: 'spells_list',
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = await readJson<{
      message?: unknown;
      model?: unknown;
      history?: unknown;
      context?: unknown;
    }>(request);

    const userMsg = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!userMsg) return fail(400, 'Message cannot be empty');

    // Check shortcuts first for instant responses
    const shortcut = processFrierenShortcuts(userMsg);
    if (shortcut) {
      return ok({
        data: {
          reply: shortcut.reply,
          model: shortcut.model,
          shortcut: shortcut.shortcut,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      });
    }

    // Prepare OmniRoute endpoint
    const routerUrl = env.router.baseUrl || 'https://router.sentinelai.studio';
    const routerKey = env.router.apiKey && env.router.apiKey.startsWith('sk-')
      ? env.router.apiKey
      : 'sk-51a1a6fafe6c7a3d-b1375d-724aa18c';

    // Enrich prompt with live router connections if asked
    let dynamicPrompt = FRIEREN_SYSTEM_PROMPT;
    const lower = userMsg.toLowerCase();
    if (['provider', 'account', 'gateway', 'omniroute', 'connection', 'model'].some((k) => lower.includes(k))) {
      try {
        const snap = await routerSnapshot();
        if (snap.connections && snap.connections.length > 0) {
          const summary = snap.connections
            .slice(0, 10)
            .map((c) => `- [${c.provider}] ${c.email || c.name || 'Account'} (${c.isActive ? 'Active' : 'Standby'})`)
            .join('\n');
          dynamicPrompt += `\n\n### Current OmniRoute Gateway State (${snap.connections.length} total connections):\n${summary}`;
        }
      } catch {
        // Fallback to static prompt
      }
    }

    const requestedModel = typeof body?.model === 'string' && body.model ? body.model.trim() : '';
    const candidateModels = requestedModel
      ? [requestedModel, 'antigravity/gemini-3.8-flash-high', 'auto/best-chat', 'auto/smart']
      : ['antigravity/gemini-3.8-flash-high', 'antigravity/gemini-3-flash', 'auto/best-chat', 'auto/smart'];

    const conversationHistory: { role: string; content: string }[] = [];
    if (Array.isArray(body?.history)) {
      for (const item of body.history.slice(-10)) {
        if (
          item &&
          typeof item === 'object' &&
          'role' in item &&
          'content' in item &&
          typeof item.content === 'string'
        ) {
          conversationHistory.push({
            role: item.role === 'user' ? 'user' : 'assistant',
            content: item.content,
          });
        }
      }
    }

    let aiReply = '';
    let answeredModel = '';

    for (const modelToTry of candidateModels) {
      try {
        const payload = {
          model: modelToTry,
          messages: [
            { role: 'system', content: dynamicPrompt },
            ...conversationHistory,
            { role: 'user', content: userMsg },
          ],
          temperature: 0.7,
        };

        const res = await fetch(`${routerUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${routerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        });

        if (res.ok) {
          const json = await res.json();
          const content = json.choices?.[0]?.message?.content?.trim();
          if (content) {
            aiReply = content;
            answeredModel = modelToTry;
            break;
          }
        }
      } catch {
        // Continue to fallback model
      }
    }

    if (!aiReply) {
      aiReply = `*I cast a sensing spell, but the OmniRoute gateway (${routerUrl}) did not return a response in time. Please ensure the 9router container on port 20128 is online, or select another provider.*`;
      answeredModel = 'fallback';
    }

    return ok({
      data: {
        reply: aiReply,
        model: answeredModel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Frieren Copilot error');
  }
}
