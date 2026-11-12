"""
Synchronize all core Sentinel projects from Windows (F:\INI KALI LA)
to Kali Linux Internal SSD (/home/kali/server)
"""
import os
import sys
import tarfile
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KALI_HOST = "192.168.68.132"
KALI_USER = "kali"
KALI_PASS = "kali"
LOCAL_ROOT = "F:\\INI KALI LA"
REMOTE_ROOT = "/home/kali/server"

# Core projects to transfer
PROJECTS = [
    "SentinelAPI",
    "Sentinel-autobot",
    "SentinelData",
    "SentinelAI",
    "SentinelCTF",
    "SentinelThreat",
    "SentinelWeb",
    "SentinelTouch",
    "SentinelFame",
    "SentinelArcuz100",
    "SentinelView",
    "SentinelEuler",
    "SentinelQuranBot",
    "SentinelMLBB",
    "SentinelHaq",
    "SentinelTruth"
]

EXCLUDE_DIRS = {
    ".git",
    ".next",
    ".cache",
    ".turbo",
    "node_modules",
    "__pycache__",
    ".venv"
}

def sync_projects():
    successes = []
    failures = []
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {KALI_USER}@{KALI_HOST}...")
    ssh.connect(KALI_HOST, port=22, username=KALI_USER, password=KALI_PASS, timeout=15)
    sftp = ssh.open_sftp()

    for proj in PROJECTS:
        local_path = os.path.join(LOCAL_ROOT, proj)
        if not os.path.exists(local_path):
            print(f"[-] Skipping {proj} (not found locally)")
            continue

        tar_name = f"{proj}.tar.gz"
        local_tar = os.path.join(LOCAL_ROOT, tar_name)
        remote_tar = f"/home/kali/{tar_name}"

        print(f"\n[*] Packaging {proj}...")
        with tarfile.open(local_tar, "w:gz") as tar:
            for root, dirs, files in os.walk(local_path):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for file in files:
                    full = os.path.join(root, file)
                    rel = os.path.relpath(full, LOCAL_ROOT)
                    tar.add(full, arcname=rel)

        tar_size_mb = os.path.getsize(local_tar) / (1024 * 1024)
        print(f"    [✓] {tar_name} ({tar_size_mb:.2f} MB). Uploading...")
        try:
            sftp.put(local_tar, remote_tar)

            print(f"    [*] Extracting to {REMOTE_ROOT}...")
            cmd = f"""
            tar -xzf "{remote_tar}" -C "{REMOTE_ROOT}"
            rm -f "{remote_tar}"
            """
            stdin, stdout, stderr = ssh.exec_command(cmd)
            exit_status = stdout.channel.recv_exit_status()
            
            if exit_status == 0:
                print(f"    [✓] {proj} successfully synchronized to internal SSD!")
                successes.append(proj)
            else:
                err = stderr.read().decode('utf-8', errors='replace').strip()
                print(f"    [-] Failed to extract {proj}: {err}")
                failures.append(proj)
        except Exception as e:
            print(f"    [-] Upload/Extract failed for {proj}: {e}")
            failures.append(proj)
        finally:
            if os.path.exists(local_tar):
                os.remove(local_tar)

    sftp.close()
    ssh.close()
    print("\n========================================================")
    print(f"  [✓] Sync complete! Success: {len(successes)}, Failed: {len(failures)}")
    if successes:
        print(f"  Successes: {', '.join(successes)}")
    if failures:
        print(f"  Failures: {', '.join(failures)}")
    print("========================================================\n")

if __name__ == "__main__":
    sync_projects()
