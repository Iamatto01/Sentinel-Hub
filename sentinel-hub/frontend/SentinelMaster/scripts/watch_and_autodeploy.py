"""
Sentinel Autonomous File Watcher & Auto-Deployer
Watches F:\\INI KALI LA and F:\\FYP2PROJECT for file changes and
automatically synchronizes and hot-deploys to Kali Linux (192.168.68.132).
"""
import os
import sys
import time
import subprocess
import argparse
import logging

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('autodeploy')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEPLOY_SCRIPT = os.path.join(SCRIPT_DIR, "fast_deploy_kali.py")

WATCH_DIRS = [
    r"F:\INI KALI LA\Sentinel Master\src",
    r"F:\INI KALI LA\Sentinel Master\public",
    r"F:\INI KALI LA\Sentinel-Brand",
    r"F:\FYP2PROJECT\frontend\src",
    r"F:\FYP2PROJECT\frontend\public",
]

def get_latest_mtime():
    latest = 0
    latest_file = None
    for d in WATCH_DIRS:
        if not os.path.exists(d): continue
        for root, _, files in os.walk(d):
            if any(x in root for x in [".next", "node_modules", "dist", ".git"]):
                continue
            for f in files:
                try:
                    full_path = os.path.join(root, f)
                    m = os.path.getmtime(full_path)
                    if m > latest:
                        latest = m
                        latest_file = full_path
                except:
                    pass
    return latest, latest_file

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deployed without deploying')
    args = parser.parse_args()

    print("=" * 65)
    print("  👁️  SENTINEL AUTOMATIC WATCHER & LIVE SYNC DAEMON")
    print("=" * 65)
    print(f"[*] Watching {len(WATCH_DIRS)} directories for live updates...")
    for d in WATCH_DIRS:
        print(f"    - {d}")
    print("\n[*] Initializing state...")
    last_mtime, _ = get_latest_mtime()
    print(f"    [✓] Watcher active! {'(DRY RUN) ' if args.dry_run else ''}Any change will auto-deploy to Kali.\n")

    while True:
        try:
            time.sleep(2)
            current_mtime, trigger_file = get_latest_mtime()
            if current_mtime > last_mtime:
                logger.info(f"Change detected in {trigger_file}! Debouncing for 3 seconds...")
                time.sleep(3)
                current_mtime, trigger_file = get_latest_mtime()
                logger.info(f"Triggering auto-deploy (latest file: {trigger_file})...")
                last_mtime = current_mtime
                if args.dry_run:
                    logger.info("[DRY RUN] Would execute deployment script here.")
                else:
                    subprocess.run([sys.executable, DEPLOY_SCRIPT])
                logger.info("Resuming watch mode...")
        except KeyboardInterrupt:
            print("\n[*] Watcher stopped.")
            break
        except Exception as e:
            logger.error(f"Error in watcher loop: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
