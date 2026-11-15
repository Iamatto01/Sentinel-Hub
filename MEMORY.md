# SENTINEL LIVING WORKSPACE BRAIN (MEMORY)

**Last Updated:** 2026-10-03  
**Authority:** Jack  
**Scope:** `F:\INI KALI LA` and Kali Linux server (`ssh.sentinelai.studio` / `qexec`).

This document acts as the persistent, living memory across all AI agent sessions. Every agent reads this before performing structural changes, database queries, or server deployments.

---

## 1. INFRASTRUCTURE & PORT REGISTRY

| Port | Service | Supervisor / Process | Path / Config |
|---|---|---|---|
| **20128** | OmniRoute (9router) | **Docker** (`9router` container) | `/mnt/external_hdd/9router/deploy-omnirouter.sh` |
| **3000** | SentinelMaster (Hub) | **PM2** (`sentinel-master`) | `/home/kali/server/SentinelMaster/server.cjs` |
| **5000** | SentinelAI Backend | **PM2** (`sentinel-backend`) | `/home/kali/server/SentinelAI/backend/src/index.js` |
| **5173** | SentinelAI Frontend | **PM2** (`sentinel-frontend`) | Vite build |
| **3010** | SentinelAPI | **PM2** (`sentinel-api`) | API endpoints |
| **3005** | SentinelMLBB | **PM2** (`sentinel-mlbb`) | MLBB bot service |
| **8009** | SentinelThreat | **PM2** (`sentinel-threat`) | Threat detection |
| **8016** | SentinelWeb | **PM2** (`sentinel-web`) | Web crawler/dashboard |
| **8028** | SentinelAlong | **PM2** (`sentinel-along`) | Floorplan & Room Sketcher (`along.sentinelai.studio`) |
| **8029** | SentinelArcuz | **PM2** (`sentinel-arcuz`) | Arcuz automation |
| **55553**| MSF RPC Daemon | **systemd** (`sentinelai.service`) | `/usr/bin/msfrpcd` (localhost only) |
| **11434**| Ollama N100 | **Docker** (`ollama-probe`) | Local quantized models |

> [!CAUTION]
> **PORT OWNERSHIP RULE:** Never use `fuser -k` or `pkill` against a port you do not own. A supervisor killing another supervisor's process causes silent data loss.

---

## 2. GATEWAY & DIRECT MODEL ROUTING

**Base URL:** `https://router.sentinelai.studio/v1` (or local origin `http://kali:20128/v1`)  
**Container:** `9router` (OmniRoute 3.8.50 on port `20128`)

Active routing uses direct provider prefixes and custom aliases:
* **Coding & Complex Logic:** `kiro/claude-sonnet-4.5` (or alias `claude-sonnet-4.5`), `kiro/claude-sonnet-4` (fast 3.2s)
* **Agent Recon & Fast Tokens:** `grok-cli/grok-composer-2.5-fast`, `antigravity/gemini-pro-agent`, `antigravity/gemini-3.7-flash-high`
* **Cleaned Up (Removed):** All legacy virtual combos (`sentinel-agent`, `sentinel-sonnet`, `sentinel-uncensored`, `sentinel-image`, `sentinel-audio-stt`), `openrouter`, `opencode`, and `local N100`.

---

## 3. DATABASE DISCIPLINE (`fyp2.db`)

* **Authoritative Database Path:** `/home/kali/server/database/fyp2.db` (physical location: `/mnt/external_hdd/server/database/fyp2.db`). `/home/kali/server/SentinelAI_Data` is symlinked to `/home/kali/server/database` for backwards compatibility.
* **Retired Copy:** The old stale copy at `/mnt/external_hdd/SentinelAI_Data/fyp2.db` was safely backed up and retired as `fyp2.db.retired-stale-20260929` (chmod 0444).
* **Canonical Resolver:**
  * ESM: `import { dbPath } from './db-path.mjs';`
  * CJS: `const { dbPath } = require('./db-path.cjs');`
  * **NEVER hardcode `output/fyp2.db` or relative SQLite paths.**
* **Read-Only by Default:** Scripts must require `--write` to mutate.
* **WAL Mode:** Database must always be in WAL journal mode (`PRAGMA journal_mode=wal`).
* **Backup Primitive:** Always use `VACUUM INTO ?` before performing structural modifications. A backup must have `integrity_check = 'ok'` AND table count > 0.

---

## 4. SECURITY & SECRETS PROTOCOL

* **Never commit secrets:** `.env`, `.env.local`, `*.pem`, `*.key` are strictly ignored.
* **Secret Masking:** Show only `sk-xxxx...last4` in logs and conversations.
* **Never edit UTF-8 files with Windows PowerShell `Set-Content`:** It injects UTF-8 BOM or mangles non-ASCII bytes. Use Python or Node for safe byte-level updates.
* **Origin Allowlist:** Dual Origin is active: supports both Cloudflare tunnel `*.sentinelai.studio` and local host `kali` / `http://kali:<port>`.

---

## 5. REPOSITORY & DEPLOYMENT CHECKLIST

Before deploying any feature or bugfix to production:
1. **Security Audit:** Verify no credentials or API keys exist in git staged files.
2. **Database Audit:** Ensure any database code uses the canonical resolver and doesn't issue uncontrolled schema drops.
3. **Syntax / Lint Check:** `node --check <file>` or `npm run build` locally.
4. **Git Commit & Push:** Meaningful commit message following conventional commits (`feat:`, `fix:`, `refactor:`).
5. **Server Deployment over SSH (`qexec`):**
   * Apply code to `/home/kali/server/<Project>`.
   * For PM2 apps: `pm2 reload <app> && pm2 save`.
   * For 9router: only recreate using `/mnt/external_hdd/9router/deploy-omnirouter.sh` followed by `pm2 save`.
6. **Health Verification:** Probe health endpoint (e.g. `curl -f http://127.0.0.1:<port>/api/health`).
7. **Auto-Rollback:** If health probe returns non-200, restore previous git commit immediately.
