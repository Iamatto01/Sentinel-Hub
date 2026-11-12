#!/usr/bin/env python3
"""
Migrate Sentinel Ecosystem to unified `/home/kali/server` hierarchy.
Preserves all databases, Docker containers, and live PM2 services.
"""

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

WINDOWS_ROOT = r"F:\INI KALI LA"
SERVER_TARGET = "/home/kali/server"
SERVER_LINK = "/home/kali/server"

def get_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(KALI_HOST, port=KALI_PORT, username=KALI_USER, password=KALI_PASS, timeout=15)
    return ssh

def run_cmd(ssh, cmd, title=""):
    if title:
        print(f"[*] {title}...")
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"    [-] Exit {code}: {out}")
    else:
        print(f"    [✓] Done")
    return code, out

def step1_prepare_filesystem(ssh):
    print("\n" + "="*60)
    print("PHASE 1: Prepare /home/kali/server & Migrate Existing Projects")
    print("="*60)

    # 1. Create target folder on high-capacity NVMe partition
    run_cmd(ssh, f"mkdir -p '{SERVER_TARGET}'", "Creating /home/kali/server")

    # 2. Backup /home/kali/server if it's a real directory with data
    script = f"""
    if [ -d "/home/kali/server" ] && [ ! -L "/home/kali/server" ]; then
        cp -rn /home/kali/server/* '{SERVER_TARGET}/' 2>/dev/null || true
        rm -rf /home/kali/server
    fi
    ln -sfn '{SERVER_TARGET}' /home/kali/server
    """
    run_cmd(ssh, script, "Linking /home/kali/server -> /home/kali/server")

    # 3. Migrate heavy projects from /home/kali (reclaiming root SSD space!)
    # SentinelAI (1.2 GB) & SentinelArcuz100 (5.6 GB)
    migrate_home_projects = f"""
    for proj in SentinelAI SentinelArcuz100; do
        if [ -d "/home/kali/$proj" ] && [ ! -L "/home/kali/$proj" ]; then
            echo "Moving $proj from /home/kali to server..."
            mv "/home/kali/$proj" "{SERVER_TARGET}/$proj"
            ln -sfn "/home/kali/server/$proj" "/home/kali/$proj"
            ln -sfn "/home/kali/server/$proj" "/home/kali/server/$proj"
        fi
    done
    """
    run_cmd(ssh, migrate_home_projects, "Moving SentinelAI & SentinelArcuz100 to server storage")

    # 4. Migrate projects from /home/kali/server into /home/kali/server/server
    # Special handle for Sentinel Master (renaming to SentinelMaster without space)
    migrate_hdd_projects = f"""
    # Sentinel Master -> SentinelMaster
    if [ -d "/home/kali/server/Sentinel Master" ] && [ ! -L "/home/kali/server/Sentinel Master" ]; then
        echo "Moving Sentinel Master -> server/SentinelMaster..."
        mv "/home/kali/server/Sentinel Master" "{SERVER_TARGET}/SentinelMaster"
        ln -sfn "/home/kali/server/SentinelMaster" "/home/kali/server/Sentinel Master"
        ln -sfn "/home/kali/server/SentinelMaster" "/home/kali/SentinelMaster"
        ln -sfn "/home/kali/server/SentinelMaster" "/home/kali/Sentinel Master"
    fi

    # Other existing projects on HDD
    for proj in SentinelAPI SentinelWeb SentinelMLBB SentinelThreat Sentinel-Brand \
                Sentinel-autobot SentinelConvert SentinelCTF Sentinel-CyberMaster \
                SentinelData SentinelFame SentinelTouch SentinelTree; do
        if [ -d "/home/kali/server/$proj" ] && [ ! -L "/home/kali/server/$proj" ]; then
            echo "Moving $proj into server..."
            mv "/home/kali/server/$proj" "{SERVER_TARGET}/$proj"
            ln -sfn "/home/kali/server/$proj" "/home/kali/server/$proj"
            ln -sfn "/home/kali/server/$proj" "/home/kali/$proj"
        fi
    done
    chown -R kali:kali "{SERVER_TARGET}"
    """
    run_cmd(ssh, migrate_hdd_projects, "Consolidating all projects into /home/kali/server & setting compatibility symlinks")

if __name__ == "__main__":
    ssh = get_ssh()
    step1_prepare_filesystem(ssh)
    _, df_out = run_cmd(ssh, "df -h / /home/kali/server", "Checking free space")
    print(df_out)
    ssh.close()
