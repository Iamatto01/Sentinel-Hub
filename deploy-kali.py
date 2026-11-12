#!/usr/bin/env python3
"""
Sentinel Master Deploy Proxy
Forwards deploy command from the workspace root to frontend/SentinelMaster/deploy-kali.py
"""
import os
import sys
import subprocess

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_SCRIPT = os.path.join(ROOT_DIR, "frontend", "SentinelMaster", "deploy-kali.py")

if not os.path.exists(TARGET_SCRIPT):
    TARGET_SCRIPT = os.path.join(ROOT_DIR, "sentinel-hub", "frontend", "SentinelMaster", "deploy-kali.py")

if not os.path.exists(TARGET_SCRIPT):
    print(f"[Error] Could not locate deploy-kali.py at: {TARGET_SCRIPT}")
    sys.exit(1)

print(f"[*] Forwarding deployment to: {TARGET_SCRIPT}")
exit_code = subprocess.call([sys.executable, TARGET_SCRIPT] + sys.argv[1:], cwd=os.path.dirname(TARGET_SCRIPT))
sys.exit(exit_code)
