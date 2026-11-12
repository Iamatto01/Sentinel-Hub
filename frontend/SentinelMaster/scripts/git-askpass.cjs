#!/usr/bin/env node
/**
 * Git askpass helper.
 *
 * Git invokes this script when it needs credentials. The token is supplied via
 * the SENTINEL_GIT_TOKEN environment variable so it never appears in argv, in
 * .git/config, or in the process list.
 */
const prompt = String(process.argv[2] ?? '').toLowerCase();

if (prompt.includes('username')) {
  process.stdout.write('x-access-token\n');
} else {
  const token = process.env.SENTINEL_GIT_TOKEN;
  if (!token) {
    process.stderr.write('SENTINEL_GIT_TOKEN is not set\n');
    process.exit(1);
  }
  process.stdout.write(`${token}\n`);
}
