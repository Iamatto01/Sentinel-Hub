"""
Master Auto-Deployment & Synchronization Script to Kali Linux Server (192.168.68.132)
Deploys:
1. Sentinel Master (Hub) with new brand logo & favicon -> /home/kali/server/SentinelMaster
2. FYP2PROJECT (SentinelAI) with new brand logo & favicon -> /home/kali/SentinelAI
3. Synchronizes brand assets (favicon.svg, favicon.ico, logo.svg, logo.png) to ALL projects on Kali
4. Rebuilds and restarts all PM2 services
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
BRAND_DIR = os.path.join(WINDOWS_ROOT, "Sentinel-Brand")
SENTINEL_MASTER_LOCAL = os.path.join(WINDOWS_ROOT, "Sentinel Master")
FYP2_LOCAL = r"F:\FYP2PROJECT"

EXCLUDE_DIRS = {
    ".git",
    ".next",
    ".cache",
    ".turbo",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "output",
    "dist"
}

def create_tar(source_dir, output_tar, rel_base=None):
    if rel_base is None:
        rel_base = source_dir
    with tarfile.open(output_tar, "w:gz") as tar:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if file.endswith((".tar.gz", ".log", ".db", ".db-wal", ".sqlite")):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, rel_base)
                tar.add(full_path, arcname=rel_path)

def exec_ssh(ssh, command, desc=""):
    if desc:
        print(f"[*] {desc}...")
    stdin, stdout, stderr = ssh.exec_command(command, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print(f"[-] Command failed with code {exit_status}")
        if out: print(out[-1000:])
        if err: print(err[-1000:])
    else:
        print(f"    [✓] Done")
    return exit_status, out

def deploy():
    print("=" * 65)
    print("  🚀 SENTINEL ECOSYSTEM AUTO-DEPLOYMENT TO KALI LINUX")
    print("=" * 65)
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to Kali Linux SSH at {KALI_HOST}:{KALI_PORT}...")
    ssh.connect(KALI_HOST, port=KALI_PORT, username=KALI_USER, password=KALI_PASS, timeout=15)
    sftp = ssh.open_sftp()
    print("    [✓] SSH & SFTP connected successfully\n")

    # ---------------------------------------------------------
    # 1. Deploy Brand Assets into Kali Brand directory
    # ---------------------------------------------------------
    print("📦 [1/4] Uploading master brand assets to Kali...")
    exec_ssh(ssh, "mkdir -p '/home/kali/server/Sentinel-Brand'")
    for asset in ["favicon.svg", "favicon.ico", "logo-base.svg", "logo-base-cyber.svg", "logo-cyber.svg", "logo-base-512.png", "logo-base-1024.png"]:
        local_asset = os.path.join(BRAND_DIR, asset)
        if os.path.exists(local_asset):
            sftp.put(local_asset, f"/home/kali/server/Sentinel-Brand/{asset}")
    print("    [✓] Master brand assets uploaded to /home/kali/server/Sentinel-Brand\n")

    # ---------------------------------------------------------
    # 2. Deploy Sentinel Master (Hub)
    # ---------------------------------------------------------
    print("📦 [2/4] Packaging & Deploying Sentinel Master (Hub)...")
    local_master_tar = os.path.join(WINDOWS_ROOT, "sentinel-master-deploy.tar.gz")
    create_tar(SENTINEL_MASTER_LOCAL, local_master_tar)
    print(f"    [✓] Created archive ({os.path.getsize(local_master_tar) / 1024:.1f} KB)")
    
    sftp.put(local_master_tar, "/home/kali/sentinel-master-deploy.tar.gz")
    os.remove(local_master_tar)
    
    deploy_cmd = """
    mkdir -p '/home/kali/server/SentinelMaster'
    tar -xzf /home/kali/sentinel-master-deploy.tar.gz -C '/home/kali/server/SentinelMaster'
    rm -f /home/kali/sentinel-master-deploy.tar.gz
    
    # Ensure public has brand assets
    mkdir -p '/home/kali/server/SentinelMaster/public'
    cp -f /home/kali/server/Sentinel-Brand/favicon.svg '/home/kali/server/SentinelMaster/public/favicon.svg'
    cp -f /home/kali/server/Sentinel-Brand/favicon.ico '/home/kali/server/SentinelMaster/public/favicon.ico'
    cp -f /home/kali/server/Sentinel-Brand/logo-base.svg '/home/kali/server/SentinelMaster/public/logo.svg'
    cp -f /home/kali/server/Sentinel-Brand/logo-base-512.png '/home/kali/server/SentinelMaster/public/logo.png'
    
    # Symlink to /home/kali/SentinelMaster
    ln -sfn '/home/kali/server/SentinelMaster' /home/kali/SentinelMaster
    
    # Build Next.js
    cd '/home/kali/server/SentinelMaster'
    npm run build
    
    # Restart PM2
    pm2 restart sentinel-master || pm2 start server.cjs --name sentinel-master
    """
    exec_ssh(ssh, deploy_cmd, "Extracting, building Next.js and restarting sentinel-master on Kali")
    print("")

    # ---------------------------------------------------------
    # 3. Deploy FYP2PROJECT (SentinelAI)
    # ---------------------------------------------------------
    print("📦 [3/4] Packaging & Deploying FYP2PROJECT (SentinelAI)...")
    local_fyp_tar = os.path.join(WINDOWS_ROOT, "fyp2-deploy.tar.gz")
    create_tar(FYP2_LOCAL, local_fyp_tar)
    print(f"    [✓] Created archive ({os.path.getsize(local_fyp_tar) / 1024:.1f} KB)")
    
    sftp.put(local_fyp_tar, "/home/kali/fyp2-deploy.tar.gz")
    os.remove(local_fyp_tar)
    
    fyp_cmd = """
    mkdir -p /home/kali/SentinelAI
    tar -xzf /home/kali/fyp2-deploy.tar.gz -C /home/kali/SentinelAI
    rm -f /home/kali/fyp2-deploy.tar.gz
    
    # Ensure public has brand assets
    mkdir -p /home/kali/SentinelAI/frontend/public
    cp -f /home/kali/server/Sentinel-Brand/favicon.svg /home/kali/SentinelAI/frontend/public/favicon.svg
    cp -f /home/kali/server/Sentinel-Brand/favicon.ico /home/kali/SentinelAI/frontend/public/favicon.ico
    cp -f /home/kali/server/Sentinel-Brand/logo-base.svg /home/kali/SentinelAI/frontend/public/logo.svg
    cp -f /home/kali/server/Sentinel-Brand/logo-base-512.png /home/kali/SentinelAI/frontend/public/logo.png
    
    # Build frontend
    cd /home/kali/SentinelAI/frontend
    npm run build
    
    # Fix symlink so /home/kali/server/SentinelAI points to active /home/kali/SentinelAI
    if [ -d "/home/kali/server/SentinelAI" ] && [ ! -L "/home/kali/server/SentinelAI" ]; then
        mv "/home/kali/server/SentinelAI" "/home/kali/server/SentinelAI_stale_backup" 2>/dev/null || true
    fi
    ln -sfn /home/kali/SentinelAI /home/kali/server/SentinelAI
    
    # Restart PM2
    pm2 restart sentinel-frontend 2>/dev/null || true
    pm2 restart sentinel-backend 2>/dev/null || true
    """
    exec_ssh(ssh, fyp_cmd, "Extracting, building frontend and restarting SentinelAI services on Kali")
    print("")

    # ---------------------------------------------------------
    # 4. Synchronize brand logo & favicon to all projects on Kali
    # ---------------------------------------------------------
    print("📦 [4/4] Synchronizing logo & favicon across all Kali project directories...")
    sync_all_cmd = """python3 -c "
import os, shutil

BRAND = '/home/kali/server/Sentinel-Brand'
FAV_SVG = os.path.join(BRAND, 'favicon.svg')
FAV_ICO = os.path.join(BRAND, 'favicon.ico')
LOGO_SVG = os.path.join(BRAND, 'logo-base.svg')
LOGO_PNG = os.path.join(BRAND, 'logo-base-512.png')

synced = 0
for root_dir in ['/home/kali/server', '/home/kali']:
    if not os.path.exists(root_dir): continue
    for item in os.listdir(root_dir):
        proj = os.path.join(root_dir, item)
        if not os.path.isdir(proj) or item in ['lost+found', 'docker', '9router-data', '.git']:
            continue
        
        candidates = [
            proj,
            os.path.join(proj, 'public'),
            os.path.join(proj, 'static'),
            os.path.join(proj, 'frontend', 'public'),
            os.path.join(proj, 'client', 'public'),
            os.path.join(proj, 'web', 'public'),
            os.path.join(proj, 'dist')
        ]
        
        hit = False
        for c in candidates:
            if os.path.exists(c):
                has_fav = os.path.exists(os.path.join(c, 'favicon.svg')) or os.path.basename(c) == 'public'
                if has_fav:
                    shutil.copy2(FAV_SVG, os.path.join(c, 'favicon.svg'))
                    shutil.copy2(FAV_ICO, os.path.join(c, 'favicon.ico'))
                    shutil.copy2(LOGO_SVG, os.path.join(c, 'logo.svg'))
                    shutil.copy2(LOGO_PNG, os.path.join(c, 'logo.png'))
                    hit = True
        if hit:
            synced += 1
            print(f'  [✓] Updated {item}')

print(f'Total projects updated on Kali: {synced}')
" """
    exec_ssh(ssh, sync_all_cmd, "Syncing assets across Kali directories")
    
    # Save PM2 state
    exec_ssh(ssh, "pm2 save", "Saving PM2 process list")
    
    sftp.close()
    ssh.close()
    print("\n" + "=" * 65)
    print("  ✅ ALL DEPLOYMENTS & SYNCHRONIZATIONS COMPLETED SUCCESSFULLY!")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    deploy()
