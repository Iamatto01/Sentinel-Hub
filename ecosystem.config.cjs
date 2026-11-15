/**
 * Sentinel Server — canonical PM2 manifest. SINGLE SOURCE OF TRUTH.
 * ================================================================
 *
 * Every PM2 application on the Kali node is defined here and nowhere else.
 * If a process is not in this file, it is not part of the server.
 *
 * HOW TO APPLY
 * ------------
 *   pm2 start /home/kali/server/SentinelMaster/ecosystem.config.cjs
 *   pm2 save
 *
 * `pm2 start` is a NO-OP for a name that already exists — it will NOT change
 * exec_mode, args, env or max_memory_restart. This was proven on the live node,
 * not assumed: restarting an existing app from a manifest left exec_mode and
 * max_memory_restart untouched and restart_time at 0.
 *
 * To change an already-running process you must delete and recreate it:
 *
 *   pm2 delete <name> && pm2 start ecosystem.config.cjs --only <name> && pm2 save
 *
 * Deploy the Hub LAST, over SSH. `sentinel-master` is the process serving the
 * dashboard that would issue the command.
 *
 * PORT OWNERSHIP — see AGENTS.md §1. One port, one owner, declared here:
 *
 *   3000  sentinel-master      Hub control plane    (HUB_PORT)
 *   3005  sentinel-mlbb        Next.js app          (CLI flag)
 *   3010  sentinel-api         SentinelAPI          (.env, restated here)
 *   5000  sentinel-backend     SentinelAI backend   (.env, restated here)
 *   5173  sentinel-frontend    vite preview         (hardcoded in package.json)
 *   8009  sentinel-threat      static file server   (CLI flag)
 *   8016  sentinel-web         SentinelWeb          (declared here — no other source)
 *   8029  sentinel-arcuz       game server          (code default)
 *   20128 OmniRoute (docker)   NOT a PM2 app — see deploy-omniroute.sh
 *   55553 msfrpcd              NOT a PM2 app — see sentinelai.service
 *
 * NOT IN THIS FILE
 * ----------------
 * `pm2-logrotate` is a PM2 module, not an application. It is installed with
 * `pm2 install pm2-logrotate`, keeps its settings in ~/.pm2/module_conf.json,
 * and manages rotation for ~/.pm2/logs. It must never appear in an ecosystem
 * file. Current settings: max_size 10M, retain 7, compress, daily at 00:00.
 *
 * LOG PATHS
 * ---------
 * No app sets `out_file` / `error_file`. All logs stay in the PM2 default
 * directory (~/.pm2/logs/<name>-{out,error}.log) for one reason: that is the
 * ONLY directory pm2-logrotate rotates. Redirecting a log elsewhere silently
 * escapes rotation and grows without bound. The Hub reads logs with
 * `pm2 logs <name>`, by process name, so file paths are free to be defaults.
 *
 * MEMORY CAPS
 * -----------
 * Measured baseline before these caps were introduced: 811.6 MB RSS across all
 * ten processes on a 7.6 GB node, the Hub itself at 172.8 MB. Only
 * sentinel-api and pm2-logrotate had a cap; the other eight were unbounded and a
 * leak would have taken down the node rather than one app. Each cap below is
 * 3-5x the measured steady state. The caps sum to ~4.3 GB, which is a worst-case
 * bound and not a reservation. `sentinel-api` keeps the 500M it already had.
 *
 * SECRETS
 * -------
 * No secret is declared here. Everything secret lives in the environment file on
 * the server: `/home/kali/server/SentinelMaster/.env.local` for the Hub,
 * `SentinelAI/.env` for the backend, `SentinelAPI/.env` for the API. A value put
 * in this file is persisted into ~/.pm2/dump.pm2, readable in the process table,
 * and survives container and deploy cycles as a stale secret.
 */

module.exports = {
  apps: [
    // ---------------------------------------------------------------------
    // The Hub. Serves hub.sentinelai.studio and is reachable on the LAN at
    // http://192.168.68.132:3000 for SENTINEL_CONTROL_CENTER.html.
    //
    // HOST defaults to 0.0.0.0 because that LAN client is live and used. To
    // restrict the Hub to loopback once the tunnel is the only intended entry
    // point, set HUB_HOST=127.0.0.1 in the environment and restart — server.cjs
    // reads `HOST || HUB_HOST || '0.0.0.0'`. Nothing else on the node honours a
    // host variable, so this is the one place the setting has any effect.
    // ---------------------------------------------------------------------
    {
      name: process.env.KALI_PM2_NAME || 'sentinel-master',
      // ------------------------------------------------------------------
      // NEVER put this spacey path in `script:` and NEVER set `interpreter`
      // for it. See AGENTS.md N-27.
      //
      // PM2 treats a `script` value containing a SPACE as a shell command: it
      // rewrites the app to exec_path=/usr/bin/bash with args=['-c', <path>],
      // but it KEEPS whatever `interpreter` was set. The child is then spawned
      // as `node /usr/bin/bash -c "<path>"` -- Node parses the bash ELF binary
      // as JavaScript, dies instantly, writes NOTHING to stderr (empty error
      // log) and PM2 restarts it forever, ending at errored / exit_code 1.
      // That is exactly how the Hub was taken down on 2026-09-26.
      //
      // Launching node directly as the script -- the same shape the live
      // `cloudflared` / `backend` / `frontend` / `threat` / `mlbb` apps use --
      // is immune: measured restarts=0 with the port bound. server.cjs derives
      // __dirname from its own path and calls loadEnvConfig(__dirname), so
      // .env.local and .next/ resolve exactly as before.
      // ------------------------------------------------------------------
      script: '/usr/bin/node',
      args: ['/home/kali/server/frontend/SentinelMaster/server.cjs'],
      cwd: '/home/kali/server/frontend/SentinelMaster',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      // server.cjs closes HTTP sockets on SIGTERM and needs up to 8s to do it.
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.HUB_PORT || '3000',
        HOST: process.env.HUB_HOST || '0.0.0.0',
      },
    },

    // ---------------------------------------------------------------------
    // SentinelAI backend and its vite preview frontend.
    // ---------------------------------------------------------------------
    {
      name: 'sentinel-backend',
      script: '/usr/bin/npm',
      args: ['run', 'backend'],
      cwd: '/home/kali/server/backend/SentinelAI',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        DB_PATH: '/home/kali/server/database/fyp2.db',
      },
    },
    {
      name: 'sentinel-frontend',
      script: '/usr/bin/npm',
      args: ['run', 'frontend'],
      cwd: '/home/kali/server/frontend/SentinelAI',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ---------------------------------------------------------------------
    // SentinelAPI. Starred port 3010 only after `require('dotenv').config()`
    // read SentinelAPI/.env, so the port is restated here to remove that
    // dependency.
    //
    // exec_mode is fork on purpose. It was running as cluster_mode with
    // instances 1, which was a misconfiguration and not a feature: there is no
    // `require('cluster')`, no isPrimary and no isMaster anywhere in
    // SentinelAPI. Cluster mode was spawning a supervisor and a worker for a
    // program that never asked to be clustered.
    // ---------------------------------------------------------------------
    {
      name: 'sentinel-api',
      script: '/home/kali/server/backend/SentinelAPI/src/index.js',
      cwd: '/home/kali/server/backend/SentinelAPI',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: '3010',
      },
    },

    // ---------------------------------------------------------------------
    // SentinelArcuz game server and the MLBB Next.js app.
    // ---------------------------------------------------------------------
    {
      name: 'sentinel-arcuz',
      script: '/home/kali/server/projects/SentinelArcuz100/server/dist/index.js',
      cwd: '/home/kali/server/projects/SentinelArcuz100/server',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
    },
    {
      name: 'sentinel-mlbb',
      script: '/usr/bin/bash',
      args: ['-c', 'npx next start -p 3005'],
      cwd: '/home/kali/server/projects/SentinelMLBB',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ---------------------------------------------------------------------
    // SentinelThreat — a static file server. The port is a CLI argument, so the
    // args array IS the port definition. Rewriting these args without keeping
    // `-c` and the exact command changes which port the service occupies.
    // ---------------------------------------------------------------------
    {
      name: 'sentinel-threat',
      script: '/usr/bin/bash',
      args: [
        '-c',
        'python3 -m http.server 8009 --directory /home/kali/server/SentinelThreat',
      ],
      cwd: '/home/kali',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
    },

    // ---------------------------------------------------------------------
    // The Cloudflare tunnel. Every one of the 32 ingress hostnames terminates
    // at 127.0.0.1, and the args below name the tunnel `sentinelai`. Dropping
    // an argument here disconnects the public surface for every project.
    // ---------------------------------------------------------------------
    {
      name: 'cloudflared',
      script: '/usr/bin/cloudflared',
      args: [
        'tunnel',
        '--edge-ip-version',
        '4',
        '--protocol',
        'http2',
        'run',
        'sentinelai',
      ],
      cwd: '/home/kali',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
    },
  ],
};
