import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.68.132', port=22, username='kali', password='kali')

js_code = """
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '__pycache__', '.venv', 'venv', '.turbo', '.cache', 'lost+found',
  'docker', '9router-data', 'SentinelAI_Data', 'SentinelAI_stale_old',
  'SentinelAI_stale_backup', 'SentinelAI_archive_old_may2026', '.sentinel-state',
  // System / Home user directories to ignore
  'Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Public',
  'Templates', 'Videos', '.config', '.local', '.cache', '.npm', '.pm2',
  'thinclient_drives', 'go', 'backend', 'frontend', 'server', 'Projects',
  'sentinel_backup', 'db-backups'
]);

const root = '/home/kali';
const entries = fs.readdirSync(root, { withFileTypes: true });

const projects = [];

for (const entry of entries) {
  if (entry.name.startsWith('.')) continue;
  if (SKIP_DIRS.has(entry.name)) continue;
  if (entry.name.includes('backup')) continue;
  if (entry.name.startsWith('9router')) continue;
  if (entry.name === 'docker' || entry.name === 'lost+found') continue;
  
  const fullPath = path.join(root, entry.name);
  let isDir = false;
  try {
    const st = fs.statSync(fullPath);
    isDir = st.isDirectory();
  } catch (err) {
    continue;
  }
  if (!isDir) continue;

  // Verify it is a valid project (either starts with Sentinel or has repo/code indicators)
  const isSentinel = entry.name.toLowerCase().startsWith('sentinel') || entry.name === 'FMS';
  const hasGit = fs.existsSync(path.join(fullPath, '.git'));
  const hasPkg = fs.existsSync(path.join(fullPath, 'package.json'));
  const hasReadme = fs.existsSync(path.join(fullPath, 'README.md')) || fs.existsSync(path.join(fullPath, 'readme.md'));

  if (isSentinel || hasGit || hasPkg) {
    projects.push({
      name: entry.name,
      path: fullPath,
      hasGit,
      hasPkg,
      hasReadme
    });
  }
}

console.log('=== Discovered ' + projects.length + ' projects in ' + root + ' ===');
projects.forEach(p => console.log('  ' + p.name.padEnd(25) + ' -> ' + p.path));
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_scan_home.js', 'w') as f:
    f.write(js_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /tmp/test_scan_home.js')
print(stdout.read().decode('utf-8', errors='replace'))
ssh.close()
