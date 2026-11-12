import os
import sys
import tarfile
import time
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KALI_HOST = "192.168.68.132"
KALI_USER = "kali"
KALI_PASS = "kali"
KALI_PORT = 22

LOCAL_ROOT = r"F:\INI KALI LA"
REMOTE_SERVER_ROOT = "/home/kali/server"

EXCLUDE_DIRS = {
    ".git",
    ".next",
    ".cache",
    ".turbo",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".parcel-cache",
    ".system_generated",
    "dist",
    "build",
    "output"
}

EXCLUDE_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    "Thumbs.db",
    ".DS_Store"
}

EXCLUDE_EXTENSIONS = (
    ".tar.gz",
    ".log",
    ".db",
    ".db-wal",
    ".db-shm",
    ".sqlite",
    ".sqlite-wal",
    ".sqlite-shm"
)

# All projects to push
ALL_PROJECTS = [
    "Sentinel Master",        # Remote destination: SentinelMaster
    "Sentinel-Brand",
    "Sentinel-autobot",
    "Sentinel-CyberMaster",
    "SentinelAI",
    "SentinelAPI",
    "SentinelArcuz100",
    "SentinelContract",
    "SentinelConvert",
    "SentinelCTF",
    "SentinelCute",
    "SentinelData",
    "SentinelEuler",
    "SentinelFame",
    "SentinelMapping",
    "SentinelMedia",
    "SentinelMesip",
    "SentinelMLBB",
    "SentinelMonkeyType",
    "SentinelNumber",
    "SentinelOS",
    "SentinelQuran",
    "SentinelQuranBot",
    "SentinelStory",
    "SentinelTakaful",
    "SentinelThreat",
    "SentinelTouch",
    "SentinelTree",
    "SentinelView",
    "SentinelWeb",
    "SentinelYesNo",
    "TijarahMabrurLogo",
    "Iamatto01",
    "skills-introduction-to-github"
]

def push_all():
    print("=" * 65)
    print("  🚀 PUSHING ALL PROJECTS TO /home/kali/server")
    print("=" * 65)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {KALI_USER}@{KALI_HOST}:{KALI_PORT}...")
    ssh.connect(KALI_HOST, port=KALI_PORT, username=KALI_USER, password=KALI_PASS, timeout=15)
    sftp = ssh.open_sftp()
    print("    [✓] Connected\n")

    # Ensure remote root exists
    ssh.exec_command(f"mkdir -p '{REMOTE_SERVER_ROOT}'")

    successes = []
    failures = []

    for idx, proj_name in enumerate(ALL_PROJECTS, 1):
        local_dir = os.path.join(LOCAL_ROOT, proj_name)
        if not os.path.exists(local_dir):
            print(f"[-] [{idx}/{len(ALL_PROJECTS)}] '{proj_name}' not found locally — skipping.")
            continue

        # Target folder name on Kali
        remote_dest_name = "SentinelMaster" if proj_name == "Sentinel Master" else proj_name
        remote_dest_dir = f"{REMOTE_SERVER_ROOT}/{remote_dest_name}"
        tar_filename = f"deploy_{remote_dest_name}.tar.gz"
        local_tar = os.path.join(LOCAL_ROOT, tar_filename)
        remote_tar = f"/home/kali/{tar_filename}"

        print(f"[*] [{idx}/{len(ALL_PROJECTS)}] Packaging '{proj_name}' -> '{remote_dest_name}'...")
        file_count = 0
        with tarfile.open(local_tar, "w:gz") as tar:
            for root, dirs, files in os.walk(local_dir):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for f in files:
                    if f in EXCLUDE_FILES or f.endswith(EXCLUDE_EXTENSIONS):
                        continue
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, local_dir)
                    tar.add(full_p, arcname=rel_p)
                    file_count += 1

        size_kb = os.path.getsize(local_tar) / 1024.0
        print(f"    [✓] Packed {file_count} files ({size_kb:.1f} KB)")

        try:
            # Upload tar
            sftp.put(local_tar, remote_tar)

            # Extract into project folder
            cmd = f"""
            mkdir -p '{remote_dest_dir}'
            tar -xzf '{remote_tar}' -C '{remote_dest_dir}'
            rm -f '{remote_tar}'
            """
            stdin, stdout, stderr = ssh.exec_command(cmd)
            code = stdout.channel.recv_exit_status()
            if code == 0:
                print(f"    [✓] Extracted to {remote_dest_dir}")
                successes.append(remote_dest_name)
            else:
                err = stderr.read().decode('utf-8', errors='replace').strip()
                print(f"    [-] Extract failed: {err}")
                failures.append(remote_dest_name)
        except Exception as exc:
            print(f"    [-] Upload failed: {exc}")
            failures.append(remote_dest_name)
        finally:
            if os.path.exists(local_tar):
                os.remove(local_tar)

    # Also push AGENTS.md
    agents_md = os.path.join(LOCAL_ROOT, "AGENTS.md")
    if os.path.exists(agents_md):
        print("\n[*] Pushing AGENTS.md...")
        try:
            sftp.put(agents_md, f"{REMOTE_SERVER_ROOT}/AGENTS.md")
            sftp.put(agents_md, "/home/kali/AGENTS.md")
            print("    [✓] AGENTS.md pushed")
        except Exception as e:
            print(f"    [-] Error pushing AGENTS.md: {e}")

    # Fix ownership
    print("\n[*] Setting permissions chown -R kali:kali on /home/kali/server...")
    ssh.exec_command(f"chown -R kali:kali '{REMOTE_SERVER_ROOT}'")

    sftp.close()
    ssh.close()

    print("\n" + "="*65)
    print(f"  🏁 PUSH COMPLETED: {len(successes)} succeeded, {len(failures)} failed")
    print("=" * 65)

if __name__ == "__main__":
    push_all()
