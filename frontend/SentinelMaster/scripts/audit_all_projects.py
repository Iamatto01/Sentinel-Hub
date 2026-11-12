import os, sys, json
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Windows Directories
win_dirs = [d for d in os.listdir(r"F:\INI KALI LA") if os.path.isdir(os.path.join(r"F:\INI KALI LA", d))]
print("=== WINDOWS 'F:\\INI KALI LA' SUBDIRECTORIES ===")
for d in sorted(win_dirs):
    print(f"  - {d}")

fyp_exists = os.path.exists(r"F:\FYP2PROJECT")
print(f"\n=== WINDOWS 'F:\\FYP2PROJECT' Exists: {fyp_exists} ===")
if fyp_exists:
    fyp_dirs = [d for d in os.listdir(r"F:\FYP2PROJECT") if os.path.isdir(os.path.join(r"F:\FYP2PROJECT", d))]
    for d in sorted(fyp_dirs):
        print(f"  - {d}")

# Kali Directories
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.68.132', port=22, username='kali', password='kali', timeout=10)

def ssh_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='replace').strip()

print("\n=== KALI '/home/kali/server' ENTRIES ===")
print(ssh_cmd("ls -la /home/kali/server"))

print("\n=== KALI '/home/kali' SENTINEL ENTRIES ===")
print(ssh_cmd("ls -la /home/kali | grep -i sentinel"))

print("\n=== KALI PM2 PROCESSES (Name, PM_CWD, Status) ===")
stdin, stdout, stderr = ssh.exec_command("pm2 jlist")
procs = json.loads(stdout.read().decode('utf-8'))
for p in procs:
    penv = p.get('pm2_env', {})
    print(f"  {p.get('name'):<20} | status: {penv.get('status'):<8} | port/script: {penv.get('pm_exec_path')} | cwd: {penv.get('pm_cwd')}")

ssh.close()
