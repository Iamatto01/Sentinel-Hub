import sys
import time
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.68.132', 22, 'kali', 'kali', timeout=15)

ECOSYSTEM = "/home/kali/server/SentinelMaster/ecosystem.config.cjs"

# Apps to recreate one-by-one, keeping sentinel-master last
APPS = [
    "sentinel-backend",
    "sentinel-frontend",
    "sentinel-api",
    "sentinel-web",
    "sentinel-arcuz",
    "sentinel-mlbb",
    "sentinel-threat",
    "cloudflared",
    "sentinel-master"
]

print("[*] Recreating live PM2 apps with new /home/kali/server paths...")

for app in APPS:
    print(f"[*] Updating {app}...")
    cmd = f"pm2 delete {app} 2>/dev/null; pm2 start '{ECOSYSTEM}' --only {app}"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', 'replace').strip()
    code = stdout.channel.recv_exit_status()
    if code == 0:
        print(f"    [✓] {app} online")
    else:
        print(f"    [-] Error on {app}: {out}")
    time.sleep(1)

print("[*] Saving PM2 state (pm2 save)...")
stdin, stdout, stderr = ssh.exec_command("pm2 save")
print(stdout.read().decode('utf-8', 'replace').strip())

print("\n[*] Final live PM2 table:")
stdin, stdout, stderr = ssh.exec_command("pm2 list")
print(stdout.read().decode('utf-8', 'replace').strip())

ssh.close()
