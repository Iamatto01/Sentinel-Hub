"""
Rapid Targeted Deployment & Project Path Harmonization for Sentinel Ecosystem
Synchronizes:
1. Master Brand & Sentinel Proxy brand assets to Kali & 9router Docker container
2. Sentinel Master Hub with KaliServerView & dynamic telemetry
3. FYP2PROJECT (SentinelAI) frontend with official brand logo
4. Bidirectional symlinks across /home/kali and /home/kali/server
5. Global brand propagation to all projects
"""
import os
import sys
import time
import paramiko

import argparse
import subprocess

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KALI_HOST = os.environ.get('KALI_HOST', '192.168.68.132')
KALI_USER = os.environ.get('KALI_USER', 'kali')
KALI_PASS = os.environ.get('KALI_PASS', 'kali')
KALI_PORT = 22

WINDOWS_ROOT = r"F:\INI KALI LA"
BRAND_DIR = os.path.join(WINDOWS_ROOT, "Sentinel-Brand")
MASTER_DIR = os.path.join(WINDOWS_ROOT, "Sentinel Master")
FYP_DIR = r"F:\FYP2PROJECT"

def run_ssh(ssh, cmd, title=""):
    if title:
        print(f"[*] {title}...")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"[-] Code {code}: {err or out}")
    else:
        if out:
            lines = out.split("\n")
            for l in lines[-4:]:
                print(f"    {l}")
        print(f"    [✓] Success")
    return code, out

def get_changed_files(project_dir, remote_prefix):
    result = subprocess.run(['git', 'diff', '--name-only', 'HEAD'], capture_output=True, text=True, cwd=project_dir)
    changed_files = result.stdout.strip().split('\n')
    files_to_sync = []
    for f in changed_files:
        if f:
            local_p = os.path.join(project_dir, f.replace('/', os.sep))
            remote_p = f"{remote_prefix}/{f}"
            files_to_sync.append((local_p, remote_p))
    return files_to_sync

def commit_docker(ssh):
    print("📦 Committing Docker Container...")
    proxy_cmd = """
    docker commit 9router sentinel-proxy:latest
    docker commit 9router mhiqrambhrng/9router-mibp-version:latest
    """
    run_ssh(ssh, proxy_cmd, "Committing container")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--docker-commit', action='store_true', help='Commit docker container')
    args = parser.parse_args()

    print("=" * 65)
    print("  🚀 RAPID TARGETED DEPLOYMENT & ECOSYSTEM HARMONIZATION")
    print("=" * 65)
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {KALI_USER}@{KALI_HOST}...")
    ssh.connect(KALI_HOST, port=KALI_PORT, username=KALI_USER, password=KALI_PASS, timeout=10)
    sftp = ssh.open_sftp()
    print("    [✓] Connected\n")

    # 1. Upload Master & Proxy Brand Assets to Kali
    print("📦 [1/6] Syncing master brand & proxy directory to Kali...")
    run_ssh(ssh, "mkdir -p '/home/kali/server/Sentinel-Brand'")
    for f in os.listdir(BRAND_DIR):
        local_f = os.path.join(BRAND_DIR, f)
        if os.path.isfile(local_f):
            sftp.put(local_f, f"/home/kali/server/Sentinel-Brand/{f}")
    print("    [✓] All brand assets synced to /home/kali/server/Sentinel-Brand\n")

    # 2. Upload Sentinel Master Updated Source Files
    print("📦 [2/6] Deploying updated Sentinel Master components to Kali...")
    files_to_sync_master = get_changed_files(MASTER_DIR, "/home/kali/server/SentinelMaster")
    files_to_sync_master.extend([
        (os.path.join(BRAND_DIR, "favicon.svg"), "/home/kali/server/SentinelMaster/public/favicon.svg"),
        (os.path.join(BRAND_DIR, "favicon.ico"), "/home/kali/server/SentinelMaster/public/favicon.ico"),
        (os.path.join(BRAND_DIR, "logo-base.svg"), "/home/kali/server/SentinelMaster/public/logo.svg"),
        (os.path.join(BRAND_DIR, "logo-base-512.png"), "/home/kali/server/SentinelMaster/public/logo.png"),
    ])
    
    for src, dst in files_to_sync_master:
        if os.path.exists(src):
            sftp.put(src, dst)
            print(f"    -> Synced {os.path.basename(src)} to {dst}")
            
    # Build Next.js on Kali
    run_ssh(ssh, "cd '/home/kali/server/SentinelMaster' && npm run build", "Building Sentinel Master Next.js on Kali")
    run_ssh(ssh, "pm2 restart sentinel-master", "Restarting sentinel-master on PM2")
    print("")

    # 3. Deploy FYP2PROJECT (SentinelAI)
    print("📦 [3/6] Deploying updated FYP2PROJECT (SentinelAI) components to Kali...")
    files_to_sync_fyp = get_changed_files(FYP_DIR, "/home/kali/SentinelAI")
    files_to_sync_fyp.extend([
        (os.path.join(BRAND_DIR, "favicon.svg"), "/home/kali/SentinelAI/frontend/public/favicon.svg"),
        (os.path.join(BRAND_DIR, "favicon.ico"), "/home/kali/SentinelAI/frontend/public/favicon.ico"),
        (os.path.join(BRAND_DIR, "logo-base.svg"), "/home/kali/SentinelAI/frontend/public/logo.svg"),
        (os.path.join(BRAND_DIR, "logo-base-512.png"), "/home/kali/SentinelAI/frontend/public/logo.png"),
    ])
    
    for src, dst in files_to_sync_fyp:
        if os.path.exists(src):
            sftp.put(src, dst)
            print(f"    -> Synced {os.path.basename(src)} to {dst}")

    # Build frontend on Kali & restart PM2
    run_ssh(ssh, "cd /home/kali/SentinelAI/frontend && npm run build", "Building SentinelAI frontend on Kali")
    run_ssh(ssh, "pm2 restart sentinel-frontend && pm2 restart sentinel-backend", "Restarting SentinelAI PM2 processes")
    print("")

    # 4. Fix Project Paths & Complete Bidirectional Symlinks
    print("📦 [4/6] Standardizing project paths and repairing bidirectional symlinks...")
    symlink_cmd = """
    # Clean stale dirs
    rm -rf /home/kali/server/SentinelAI_stale_old /home/kali/server/SentinelAI_stale_backup 2>/dev/null || true

    # Core bidirectional links
    ln -sfn /home/kali/SentinelAI /home/kali/server/SentinelAI
    ln -sfn /home/kali/SentinelArcuz100 /home/kali/server/SentinelArcuz100
    ln -sfn '/home/kali/server/SentinelMaster' /home/kali/SentinelMaster

    for p in SentinelAPI SentinelMLBB SentinelWeb SentinelThreat SentinelTouch SentinelData SentinelCTF SentinelFame Sentinel-autobot Sentinel-CyberMaster Sentinel-Brand SentinelConvert SentinelTree; do
        if [ -d "/home/kali/server/$p" ]; then
            ln -sfn "/home/kali/server/$p" "/home/kali/$p"
        fi
    done
    """
    run_ssh(ssh, symlink_cmd, "Creating full bidirectional project symlinks")
    print("")

    # 5. Sentinel Proxy (9router) Container Brand Deployment
    print("📦 [5/6] Updating Sentinel Proxy Docker Container...")
    proxy_cmd = """
    docker cp /home/kali/server/Sentinel-Brand/favicon-proxy.svg 9router:/app/public/favicon.svg
    docker cp /home/kali/server/Sentinel-Brand/favicon-proxy.ico 9router:/app/public/favicon.ico
    docker cp /home/kali/server/Sentinel-Brand/logo-proxy.svg 9router:/app/public/logo.svg
    docker cp /home/kali/server/Sentinel-Brand/favicon-proxy.svg 9router:/app/public/icons/icon-192.svg
    docker cp /home/kali/server/Sentinel-Brand/favicon-proxy.svg 9router:/app/public/icons/icon-512.svg
    docker restart 9router
    """
    run_ssh(ssh, proxy_cmd, "Deploying Sentinel Proxy assets")
    
    if args.docker_commit:
        commit_docker(ssh)
        
    print("")

    # 6. Sync Favicons & Logos to ALL projects on Kali
    print("📦 [6/6] Propagating favicon & logo to all Kali projects...")
    sync_script = """python3 -c "
import os, shutil

BRAND = '/home/kali/server/Sentinel-Brand'
FAV_SVG = os.path.join(BRAND, 'favicon.svg')
FAV_ICO = os.path.join(BRAND, 'favicon.ico')
LOGO_SVG = os.path.join(BRAND, 'logo-base.svg')
LOGO_PNG = os.path.join(BRAND, 'logo-base-512.png')

updated = 0
for root in ['/home/kali/server', '/home/kali']:
    if not os.path.exists(root): continue
    for item in os.listdir(root):
        p = os.path.join(root, item)
        if not os.path.isdir(p) or item in ['lost+found', 'docker', '9router-data', '.git', 'node_modules', 'Sentinel-Brand']:
            continue
        
        for sub in ['', 'public', 'static', 'frontend/public', 'client/public', 'web/public']:
            target_dir = os.path.join(p, sub) if sub else p
            if os.path.isdir(target_dir):
                if os.path.exists(os.path.join(target_dir, 'favicon.svg')) or os.path.basename(target_dir) == 'public':
                    shutil.copy2(FAV_SVG, os.path.join(target_dir, 'favicon.svg'))
                    shutil.copy2(FAV_ICO, os.path.join(target_dir, 'favicon.ico'))
                    shutil.copy2(LOGO_SVG, os.path.join(target_dir, 'logo.svg'))
                    shutil.copy2(LOGO_PNG, os.path.join(target_dir, 'logo.png'))
                    updated += 1

print(f'Done! Updated {updated} target locations.')
" """
    run_ssh(ssh, sync_script, "Syncing assets across all projects")
    
    sftp.close()
    ssh.close()
    
    print("\n" + "=" * 65)
    print("  ✅ FULL ECOSYSTEM DEPLOYMENT & SYNCHRONIZATION COMPLETE!")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
