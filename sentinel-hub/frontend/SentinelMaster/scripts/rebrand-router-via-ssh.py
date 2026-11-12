#!/usr/bin/env python3
"""Rebrand the OmniRoute Docker container on Kali to 'Sentinel Route'.

Usage:
  python scripts/rebrand-router-via-ssh.py
"""

import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import paramiko
except ImportError:
    print("[Error] 'paramiko' is required. Run: pip install paramiko")
    sys.exit(1)


KALI_HOST = os.environ.get("KALI_HOST", "192.168.68.132").strip()
KALI_PORT = int(os.environ.get("KALI_PORT", "22"))
KALI_USER = os.environ.get("KALI_USER", "kali").strip()
KALI_PASS = os.environ.get("KALI_PASS", "kali") or None
KALI_KNOWN_HOSTS = os.environ.get("KALI_KNOWN_HOSTS") or None
KALI_KEY_FILENAME = os.environ.get("KALI_KEY_FILENAME") or None

CHUNK_DIR = "/app/.build/next/static/chunks"
HTML_DIR = "/app/.build/next/server"


def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.load_system_host_keys()
    if KALI_KNOWN_HOSTS:
        ssh.load_host_keys(os.path.expanduser(os.path.expandvars(KALI_KNOWN_HOSTS)))

    kwargs = {
        "port": KALI_PORT,
        "username": KALI_USER,
        "timeout": 15,
        "banner_timeout": 15,
        "auth_timeout": 15,
        "look_for_keys": True,
        "allow_agent": True,
    }
    if KALI_KEY_FILENAME:
        kwargs["key_filename"] = os.path.expanduser(os.path.expandvars(KALI_KEY_FILENAME))
    if KALI_PASS:
        kwargs["password"] = KALI_PASS

    print(f"Connecting to {KALI_USER}@{KALI_HOST}:{KALI_PORT}...")
    ssh.connect(KALI_HOST, **kwargs)
    return ssh


def run(ssh, cmd, timeout=120):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    try:
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
    finally:
        stdin.close()
    return out, err, rc


def main():
    ssh = connect()
    try:
        # Step 1: Detect container
        print("\n[1/5] Detecting router container name...")
        out, _, _ = run(ssh, "docker ps --format '{{.Names}}'")
        containers = [c.strip() for c in out.splitlines() if c.strip()]
        if "9router" in containers:
            container = "9router"
        elif "docker-proxy" in containers:
            container = "docker-proxy"
        else:
            print(f"ERROR: Neither '9router' nor 'docker-proxy' is running. Found: {containers}")
            sys.exit(1)
        print(f"  ✅ Target container: {container}")

        # Step 2: Audit BEFORE
        print("\n[2/5] Auditing current branding (BEFORE)...")
        audit_cmd = f"""docker exec {container} sh -c '
echo "=== Remaining omni/proxy ref count ==="
grep -rc -i "omniroute\\|omni.router\\|omni2\\|sentinel.proxy" {CHUNK_DIR}/ {HTML_DIR}/ 2>/dev/null | grep -v ":0$" || echo "(none — already clean)"
'"""
        out, _, _ = run(ssh, audit_cmd)
        print(out.strip())

        # Step 3: Apply replacements
        print("\n[3/5] Applying 'Sentinel Route' sed replacements...")
        replace_cmd = f"""docker exec {container} sh -c '
TARGETS=$(grep -rl -e "OmniRoute" -e "Omni Router" -e "omni2" -e "Sentinel Proxy" -e "OMNIPROXY" -e "OmniProxy" -e "omni-proxy" {CHUNK_DIR}/ {HTML_DIR}/ 2>/dev/null || true)
if [ -z "$TARGETS" ]; then
  echo "No files need patching."
else
  COUNT=$(echo "$TARGETS" | wc -l)
  echo "Patching $COUNT file(s)..."
  for f in $TARGETS; do
    sed -i \
      -e "s/OmniRoute/Sentinel Route/g" \
      -e "s/Omni Router/Sentinel Route/g" \
      -e "s/Omni router/Sentinel Route/g" \
      -e "s/omni router/Sentinel Route/g" \
      -e "s/OMNIPROXY/SENTINEL ROUTE/g" \
      -e "s/OmniProxy/Sentinel Route/g" \
      -e "s/omniProxy/sentinelRoute/g" \
      -e "s/omni-proxy/sentinel-route/g" \
      -e "s/omni2/Sentinel Route/g" \
      -e "s/Omni2/Sentinel Route/g" \
      -e "s/Sentinel Proxy/Sentinel Route/g" \
      -e "s/sentinel-proxy/sentinel-route/g" \
      -e "s/sentinel_proxy/sentinel_route/g" \
      "$f" 2>/dev/null || true
  done
  echo "Replacements done."
fi
'"""
        out, err, rc = run(ssh, replace_cmd, timeout=180)
        print(f"  {out.strip()}")

        # Step 4: Audit AFTER
        print("\n[4/5] Auditing branding (AFTER)...")
        verify_cmd = f"""docker exec {container} sh -c '
REMAIN=$(grep -rc -i "omniroute\\|omni.router\\|omni2\\|sentinel.proxy" {CHUNK_DIR}/ {HTML_DIR}/ 2>/dev/null | grep -v ":0$" || true)
if [ -z "$REMAIN" ]; then
  echo "✅ CLEAN — no old branding remains."
else
  echo "⚠️ Matches remaining:"
  echo "$REMAIN"
fi
'"""
        out, _, _ = run(ssh, verify_cmd)
        print(out.strip())

        # Step 5: Restart and Commit
        print("\n[5/5] Restarting container and committing image...")
        run(ssh, f"docker restart {container}")
        out, err, rc = run(ssh, f"docker commit {container} sentinel-proxy:omniroute-3.8.50-pwfix")
        if rc == 0:
            print("  ✅ Committed container to image 'sentinel-proxy:omniroute-3.8.50-pwfix'")
        else:
            print(f"  ⚠️ docker commit warning: {err.strip()}")

        print("\n==========================================================")
        print("  ✅ REBRAND COMPLETE: 'Sentinel Route' is now active!")
        print("  Hard refresh your browser (Ctrl + Shift + R) on:")
        print("  https://router.sentinelai.studio/home")
        print("==========================================================")

    finally:
        ssh.close()


if __name__ == "__main__":
    main()
