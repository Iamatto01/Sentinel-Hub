/**
 * Production entry point for the Sentinel Master Hub.
 *
 * deploy-kali.py expects exactly this file (`server.cjs`) at the project root,
 * runs `next build --webpack`, then starts this process on 127.0.0.1:3000 and
 * health-checks it. Booting Next programmatically (instead of `next start`)
 * keeps that contract intact and lets us hard-fail on missing secrets before a
 * single request is served.
 */
const path = require('node:path');
const http = require('node:http');
const next = require('next');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(__dirname);

const port = Number.parseInt(process.env.PORT || process.env.HUB_PORT || '3000', 10);
const hostname = process.env.HOST || process.env.HUB_HOST || '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

function fatal(lines) {
  process.stderr.write(
    ['', '  Sentinel Master Hub cannot start:', ...lines.map((line) => `    - ${line}`), ''].join('\n'),
  );
  process.exit(1);
}

const password = (process.env.HUB_DASHBOARD_PASSWORD || '').trim();
const secret = (process.env.HUB_SESSION_SECRET || '').trim();

const problems = [];
if (!password) problems.push('HUB_DASHBOARD_PASSWORD is required to gate the dashboard');
if (!secret) problems.push('HUB_SESSION_SECRET is required to sign sessions');
else if (secret.length < 32) problems.push('HUB_SESSION_SECRET must be at least 32 characters');
if (password && secret && password === secret) {
  problems.push('HUB_SESSION_SECRET must be different from HUB_DASHBOARD_PASSWORD');
}
if (problems.length > 0) fatal(problems);

const app = next({ dev, hostname, port, dir: __dirname });

app
  .prepare()
  .then(() => {
    const handler = app.getRequestHandler();

    const server = http.createServer((req, res) => {
      // A bare health probe used by the deployment script and PM2.
      if (req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true, uptimeSeconds: Math.round(process.uptime()) }));
        return;
      }
      handler(req, res);
    });

    // Never let a slow client hold a socket open forever.
    server.headersTimeout = 65_000;
    server.requestTimeout = 120_000;
    server.keepAliveTimeout = 60_000;

    server.listen(port, hostname, () => {
      process.stdout.write(`Sentinel Master Hub ready on http://${hostname}:${port}\n`);
    });

    const shutdown = (signal) => {
      process.stdout.write(`Received ${signal}, shutting down\n`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 8_000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((error) => {
    fatal([`Next.js failed to start: ${error && error.message ? error.message : String(error)}`]);
  });

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}\n`);
});

module.exports = {};
