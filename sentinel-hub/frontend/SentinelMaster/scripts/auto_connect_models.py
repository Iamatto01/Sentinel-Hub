#!/usr/bin/env python3
"""
Sentinel Auto-Connect & Token Injector
Automatically launches Edge for user login, extracts session tokens,
and uploads them to OmniRoute via POST /api/providers/bulk-web-session.
"""

import os
import sys
import time
import json
import subprocess
from selenium import webdriver
from selenium.webdriver.edge.options import Options

ACCOUNTS = [
    "businessatto001@gmail.com",
    "sentinelstudio04@gmail.com",
    "syifaputrixez@gmail.com"
]

ROUTER_PASS = "sentinel_admin_secret_2026"
PROFILES_BASE = r"F:\INI KALI LA\Sentinel Master\.browser_profiles"

def push_to_omniroute(provider, entries):
    """Pushes tokens to OmniRoute on Kali via SSH and bulk-web-session API."""
    print(f"\n[OMNIROUTE] Uploading {len(entries)} tokens for provider '{provider}'...")
    
    # 1. Ensure logged in to get cookie jar
    login_cmd = f"curl -s -c /tmp/omni.jar -X POST http://127.0.0.1:20128/api/auth/login -H 'Content-Type: application/json' -d '{{\"password\":\"{ROUTER_PASS}\"}}'"
    subprocess.run(["ssh", "-n", "qexec", login_cmd], capture_output=True, text=True)
    
    # 2. Call bulk-web-session
    payload = {
        "provider": provider,
        "entries": entries,
        "priority": 1,
        "globalPriority": None
    }
    
    import base64
    b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    upload_sh = f"""
    curl -s -b /tmp/omni.jar -X POST http://127.0.0.1:20128/api/providers/bulk-web-session \
      -H 'Content-Type: application/json' \
      -d \"$(echo '{b64}' | base64 -d)\"
    """
    
    res = subprocess.run(["ssh", "-n", "qexec", upload_sh], capture_output=True, text=True)
    print(f"[OMNIROUTE] Response: {res.stdout.strip()}")
    return "created" in res.stdout or "success" in res.stdout

def harvest_deepseek(account_email):
    """Launches Edge, waits for user login, and automatically extracts userToken."""
    account_prefix = account_email.split("@")[0]
    profile_dir = os.path.join(PROFILES_BASE, account_prefix)
    os.makedirs(profile_dir, exist_ok=True)
    
    print("\n" + "=" * 65)
    print(f"  TARGET: DeepSeek Web ({account_email})")
    print("=" * 65)
    print("[1] Opening Microsoft Edge on your screen...")
    print("[2] Sila klik 'Sign in with Google' dan pilih akaun ini jika belum log masuk.")
    print("[3] Sebaik sahaja log masuk, skrip akan terus mengesan token secara automatik!")
    print("-" * 65)
    
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(f"--user-data-dir={profile_dir}")
    
    driver = webdriver.Edge(options=opts)
    driver.get("https://chat.deepseek.com")
    
    token = None
    start_time = time.time()
    max_wait = 300 # 5 minutes
    
    while time.time() - start_time < max_wait:
        time.sleep(1.5)
        try:
            ls = driver.execute_script("return {...window.localStorage};")
            for k, v in ls.items():
                if "usertoken" in k.lower() and v:
                    try:
                        parsed = json.loads(v)
                        val = parsed.get("value")
                        if val and isinstance(val, str) and len(val) > 25 and val != "null":
                            token = val
                            break
                    except Exception:
                        clean_v = str(v).strip('"')
                        if clean_v and len(clean_v) > 25 and "null" not in clean_v:
                            token = clean_v
                            break
            if token:
                print(f"\n>>> [BERJAYA] Token DeepSeek untuk {account_email} dikesan!")
                break
        except Exception:
            pass
            
    driver.quit()
    return token

def harvest_kimi(account_email):
    """Launches Edge, waits for user login, and automatically extracts Kimi access_token."""
    account_prefix = account_email.split("@")[0]
    profile_dir = os.path.join(PROFILES_BASE, account_prefix)
    os.makedirs(profile_dir, exist_ok=True)
    
    print("\n" + "=" * 65)
    print(f"  TARGET: Kimi Web ({account_email})")
    print("=" * 65)
    print("[1] Opening Microsoft Edge to www.kimi.ai...")
    print("[2] Sila klik 'Log in with Google' dan pilih akaun ini jika belum log masuk.")
    print("[3] Token akan dikesan automatik sebaik sahaja log masuk.")
    print("-" * 65)
    
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(f"--user-data-dir={profile_dir}")
    
    driver = webdriver.Edge(options=opts)
    driver.get("https://www.kimi.ai")
    
    token = None
    start_time = time.time()
    max_wait = 300
    
    while time.time() - start_time < max_wait:
        time.sleep(1.5)
        try:
            ls = driver.execute_script("return {...window.localStorage};")
            for k, v in ls.items():
                if "access_token" in k.lower() and v and len(str(v)) > 20:
                    token = str(v).strip('"')
                    break
                if "token" in k.lower() and v and len(str(v)) > 20 and "refresh" not in k.lower():
                    token = str(v).strip('"')
                    break
            if not token:
                cookies = driver.get_cookies()
                for c in cookies:
                    if c.get("name") in ["kimi-auth", "access_token"]:
                        token = c.get("value")
                        break
            if token:
                print(f"\n>>> [BERJAYA] Token Kimi untuk {account_email} dikesan!")
                break
        except Exception:
            pass
            
    driver.quit()
    return token

def harvest_zai(account_email):
    """Launches Edge, waits for user login, and automatically extracts Z.ai token."""
    account_prefix = account_email.split("@")[0]
    profile_dir = os.path.join(PROFILES_BASE, account_prefix)
    os.makedirs(profile_dir, exist_ok=True)
    
    print("\n" + "=" * 65)
    print(f"  TARGET: Z.ai (GLM) Web ({account_email})")
    print("=" * 65)
    print("[1] Opening Microsoft Edge to chat.z.ai...")
    print("[2] Sila log masuk dengan Google.")
    print("[3] Token akan dikesan automatik sebaik sahaja log masuk.")
    print("-" * 65)
    
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(f"--user-data-dir={profile_dir}")
    
    driver = webdriver.Edge(options=opts)
    driver.get("https://chat.z.ai")
    
    token = None
    start_time = time.time()
    max_wait = 300
    
    while time.time() - start_time < max_wait:
        time.sleep(1.5)
        try:
            ls = driver.execute_script("return {...window.localStorage};")
            for k, v in ls.items():
                if k == "token" and v and len(str(v)) > 20:
                    token = str(v).strip('"')
                    break
            if token:
                print(f"\n>>> [BERJAYA] Token Z.ai untuk {account_email} dikesan!")
                break
        except Exception:
            pass
            
    driver.quit()
    return token

def update_kimi_combos():
    """Configures kimi-3 combo to route directly to real Kimi 3 (k3) on www.kimi.ai."""
    print("\n[OMNIROUTE] Updating kimi-3 combo to route directly to real Kimi 3 (k3)...")
    py_script = """
import json, subprocess

out = subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/providers']).decode()
providers_data = json.loads(out)
kimi_conns = [c for c in providers_data.get('connections', []) if c.get('provider') == 'kimi-web' and c.get('isActive')]

print(f'Found {len(kimi_conns)} active kimi-web connections in pool.')
if not kimi_conns:
    print('No active kimi-web connections yet.')
    exit(0)

models_list = []
for i, c in enumerate(kimi_conns):
    models_list.append({
        'id': f'kimi-web-{c["name"]}-{i}',
        'kind': 'model',
        'providerId': c['id'],
        'model': f"{c['id']}/k3",
        'weight': 100
    })

# Fallback to CFP
models_list.append({
    'id': 'kimi-cfp-fallback',
    'kind': 'model',
    'providerId': 'cloudflare-playground',
    'model': 'cfp/moonshotai/kimi-k2.7-code',
    'weight': 30
})

for combo_name in ['kimi-3', 'k3']:
    payload = {
        'name': combo_name,
        'strategy': 'round-robin',
        'stickyRoundRobinLimit': 2,
        'models': models_list
    }
    cmd = [
        'curl', '-s', '-b', '/tmp/omni.jar', '-X', 'POST',
        'http://127.0.0.1:20128/api/combos',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    res = subprocess.check_output(cmd).decode()
    print(f'Updated combo {combo_name}: {res[:100]}')
"""
    import base64
    b64 = base64.b64encode(py_script.encode()).decode()
    subprocess.run(["ssh", "-n", "qexec", f"echo '{b64}' | base64 -d | python3"])

def update_deepseek_combos():
    """Configures deepseek-v4-pro and deepseek-v4.1 combos to use pooled deepseek-web legs."""
    print("\n[OMNIROUTE] Updating combos to pool deepseek-web accounts with fallback...")
    py_script = """
import urllib.request, json
import subprocess

out = subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/providers']).decode()
providers_data = json.loads(out)
ds_conns = [c for c in providers_data.get('connections', []) if c.get('provider') == 'deepseek-web' and c.get('isActive')]

print(f'Found {len(ds_conns)} active deepseek-web connections in pool.')
if not ds_conns:
    print('No active deepseek-web connections yet.')
    exit(0)

models_list = []
for i, c in enumerate(ds_conns):
    models_list.append({
        'id': f'ds-web-{c["name"]}-{i}',
        'kind': 'model',
        'providerId': c['id'],
        'model': f"{c['id']}/deepseek-chat",
        'weight': 100
    })

# Fallback to CFP
models_list.append({
    'id': 'ds-cfp-fallback',
    'kind': 'model',
    'providerId': 'cloudflare-playground',
    'model': 'cfp/deepseek-ai/deepseek-v4-pro-0813',
    'weight': 30
})

for combo_name in ['deepseek-v4-pro', 'deepseek-v4.1']:
    payload = {
        'name': combo_name,
        'strategy': 'round-robin',
        'stickyRoundRobinLimit': 2,
        'models': models_list
    }
    cmd = [
        'curl', '-s', '-b', '/tmp/omni.jar', '-X', 'POST',
        'http://127.0.0.1:20128/api/combos',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    res = subprocess.check_output(cmd).decode()
    print(f'Updated combo {combo_name}: {res[:100]}')
"""
    import base64
    b64 = base64.b64encode(py_script.encode()).decode()
    subprocess.run(["ssh", "-n", "qexec", f"echo '{b64}' | base64 -d | python3"])

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Sentinel Router Model Auto-Connector")
    parser.add_argument("--provider", choices=["deepseek", "kimi", "zai", "all"], default="deepseek",
                        help="Provider to connect (default: deepseek)")
    args = parser.parse_args()
    
    print("\n" + "#" * 65)
    print("  SENTINEL ROUTER - AUTO-CONNECT & TOKEN POOLING HARVESTER")
    print(f"  Target Provider: {args.provider.upper()}")
    print("#" * 65)
    
    if args.provider in ["deepseek", "all"]:
        ds_entries = []
        for acc in ACCOUNTS:
            token = harvest_deepseek(acc)
            if token:
                ds_entries.append({"name": acc.split("@")[0], "credential": token})
        if ds_entries:
            push_to_omniroute("deepseek-web", ds_entries)
            update_deepseek_combos()
            
    if args.provider in ["kimi", "all"]:
        kimi_entries = []
        for acc in ACCOUNTS:
            token = harvest_kimi(acc)
            if token:
                kimi_entries.append({"name": acc.split("@")[0], "credential": token})
        if kimi_entries:
            push_to_omniroute("kimi-web", kimi_entries)
            update_kimi_combos()
            
    if args.provider in ["zai", "all"]:
        zai_entries = []
        for acc in ACCOUNTS:
            token = harvest_zai(acc)
            if token:
                zai_entries.append({"name": acc.split("@")[0], "credential": token})
        if zai_entries:
            push_to_omniroute("zai-web", zai_entries)

    print("\n" + "=" * 65)
    print("  PROSES SELESAI!")
    print("=" * 65)

if __name__ == "__main__":
    main()
