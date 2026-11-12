---
name: sentinel-guardian
description: >-
  Use this skill whenever code is ready to be audited, committed, pushed to GitHub,
  or deployed to the Kali Linux server. Performs security audit, database compliance check,
  safe git commit/push, and zero-downtime server deployment with rollback.
---

# Sentinel Guardian & Safe Deployer Skill

This runbook defines the standard operating procedure for the Sentinel Guardian Agent. It ensures that every code change is secure, adheres to the workspace `AGENTS.md` operating rules, and deploys cleanly to the server with zero data loss or downtime.

---

## 1. PRE-FLIGHT SECURITY CHECKLIST

Before staging any files or committing:

1. **Secret Leak Detection:**
   * Scan all modified files for accidental hardcoded credentials (API keys, passwords, bearer tokens, JWT secrets, private keys).
   * Verify that `.env`, `.env.local`, and credential files are gitignored:
     ```powershell
     git status --ignored
     ```
2. **Database Discipline Check (`AGENTS.md` §2):**
   * If any backend or database file is touched, verify it imports the authoritative resolver:
     * ESM: `import { dbPath } from './db-path.mjs';`
     * CJS: `const { dbPath } = require('./db-path.cjs');`
   * Confirm that no raw `output/fyp2.db` strings or direct filesystem mutations exist without `--write`.
   * Confirm WAL mode is preserved and no uncheckpointed `.db-wal` files are deleted.
3. **Syntax & Compile Check:**
   * JavaScript/TypeScript: `node --check <file>` or `npm run build` / `npm test`.
   * Shell scripts: `bash -n <script.sh>` (or over SSH for Linux scripts).

---

## 2. SAFE GIT COMMIT & PUSH

1. Review git diff:
   ```powershell
   git status
   git diff --stat
   ```
2. Stage only intentional files (never `git add .` blindly if untracked secret files are present).
3. Commit with a structured commit message:
   ```powershell
   git commit -m "feat(scope): descriptive summary"
   ```
4. Push to remote GitHub repository:
   ```powershell
   git push origin <branch>
   ```

---

## 3. SERVER DEPLOYMENT PROTOCOL (KALI LINUX)

Deploying to the server uses the configured Cloudflare SSH tunnel (`qexec`):

1. **Pull or Sync Code to Server:**
   ```bash
   ssh -n qexec "cd /home/kali/server/<Project> && git pull origin <branch>"
   ```
2. **Reload Target Supervisor:**
   * **For PM2 Apps (`sentinel-master`, `sentinel-backend`, `sentinel-frontend`, `sentinel-api`):**
     ```bash
     ssh -n qexec "pm2 reload <app-name> && pm2 save"
     ```
   * **For 9router (Docker):**
     * NEVER `docker run` manually. Only run:
       ```bash
       ssh -n qexec "/mnt/external_hdd/9router/deploy-omnirouter.sh && pm2 save"
       ```
3. **Post-Deployment Health Probe:**
   Verify that the service is running and returning HTTP 200:
   ```bash
   ssh -n qexec "curl -s -f http://127.0.0.1:<port>/api/health || curl -s -f http://127.0.0.1:<port>/healthz"
   ```

---

## 4. AUTOMATIC ROLLBACK PROTOCOL

If the post-deployment health probe fails (status != 200 or connection refused):
1. **Immediately revert the git commit on the server:**
   ```bash
   ssh -n qexec "cd /home/kali/server/<Project> && git reset --hard HEAD~1"
   ```
2. **Restart supervisor to restore stable build:**
   ```bash
   ssh -n qexec "pm2 reload <app-name> && pm2 save"
   ```
3. Notify the user with exact error logs and confirm that the previous working version was restored.
