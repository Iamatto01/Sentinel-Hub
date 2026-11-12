import sys
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.68.132', 22, 'kali', 'kali', timeout=15)
cmd = """
export PM2_HOME=/tmp/pm2dry
pm2 start /home/kali/server/SentinelMaster/ecosystem.config.cjs
pm2 jlist | python3 -c '
import json, sys
for p in json.load(sys.stdin):
    e = p["pm2_env"]
    name = p["name"]
    cwd = e.get("pm_cwd", "")
    script = e.get("pm_exec_path", "")
    args = e.get("args", [])
    print(f"{name:20} cwd={cwd:35} script={script:35} args={args}")
'
pm2 kill
rm -rf /tmp/pm2dry
unset PM2_HOME
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print("--- STDOUT ---")
print(stdout.read().decode('utf-8', 'replace'))
print("--- STDERR ---")
print(stderr.read().decode('utf-8', 'replace'))
ssh.close()
