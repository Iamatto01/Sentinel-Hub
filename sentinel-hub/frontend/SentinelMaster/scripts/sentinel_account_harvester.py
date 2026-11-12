#!/usr/bin/env python3
"""
Sentinel AI Fleet Controller & Multi-Account Harvester
Authoritative management tool for multi-account pool onboarding,
database provisioning, health monitoring, and client configuration.
"""

import os
import sys
import time
import json
import base64
import argparse
import datetime
import requests
import paramiko
from selenium import webdriver
from selenium.webdriver.edge.options import Options

sys.stdout.reconfigure(encoding='utf-8')

# Host & Infrastructure Configuration
KALI_HOST = "192.168.68.132"
KALI_USER = "kali"
KALI_PASS = "kali"
KALI_PORT = 22
REMOTE_DB_PATH = "/home/kali/server/9router-data/storage.sqlite"
GATEWAY_URL = "https://router.sentinelai.studio/v1"
CLASS_API_KEY = "sk-sentinel-class-vip"

DUMMY_ACCOUNTS = [
    "businessatto001@gmail.com",
    "sentinelstudio04@gmail.com",
    "syifaputrixez@gmail.com"
]

def get_ssh_client():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(KALI_HOST, port=KALI_PORT, username=KALI_USER, password=KALI_PASS, timeout=10)
    return ssh

def execute_remote_sql(sql_query, params=()):
    ssh = get_ssh_client()
    script = f"""import sqlite3, json, sys

db = sqlite3.connect('{REMOTE_DB_PATH}')
c = db.cursor()
query = {repr(sql_query)}
params = {repr(params)}
c.execute(query, params)
if query.strip().upper().startswith('SELECT'):
    rows = c.fetchall()
    print(json.dumps(rows))
else:
    db.commit()
    print(json.dumps({{'rows_affected': c.rowcount}}))
db.close()
"""
    b64_script = base64.b64encode(script.encode('utf-8')).decode('utf-8')
    cmd = f"python3 -c \"import base64; exec(base64.b64decode('{b64_script}').decode('utf-8'))\""
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    ssh.close()
    if err and not out:
        raise RuntimeError(f"SSH Execution Error: {err}")
    return json.loads(out) if out else None

def get_profile_path(account_email):
    account_prefix = account_email.split('@')[0]
    master_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_dir = os.path.join(master_dir, ".browser_profiles", account_prefix)
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def launch_edge_browser(user_data_dir=None, headless=False):
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    else:
        opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    if user_data_dir:
        opts.add_argument(f"--user-data-dir={user_data_dir}")
    driver = webdriver.Edge(options=opts)
    return driver

def harvest_kimi_session(account_email, auto_check=False):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n[HARVEST: KIMI] Target: {account_email}")
    print(f"[STORAGE] Isolated Profile: {profile_dir}")
    
    driver = launch_edge_browser(profile_dir, headless=auto_check)
    driver.get("https://www.kimi.ai")
    
    if not auto_check:
        print("-" * 65)
        print(f"[ACTION REQUIRED] In the opened Edge browser:")
        print(f"  1. Click 'Log in with Google'")
        print(f"  2. Select account: {account_email}")
        print(f"  3. Token extraction will complete automatically upon sign-in.")
        print("-" * 65)
    
    token = None
    refresh_token = None
    max_wait = 180 if not auto_check else 15
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        time.sleep(2)
        try:
            local_storage = driver.execute_script("return {...window.localStorage};")
            for k, v in local_storage.items():
                if "access_token" in k.lower() and v and len(str(v)) > 20:
                    token = str(v).strip('"')
                if "refresh_token" in k.lower() and v and len(str(v)) > 20:
                    refresh_token = str(v).strip('"')
            
            if not token:
                cookies = driver.get_cookies()
                for c in cookies:
                    if c.get("name") in ["kimi-auth", "access_token"]:
                        token = c.get("value")
            
            if token:
                break
        except Exception:
            pass

    driver.quit()
    
    if not token:
        print(f"[ERROR] Session extraction timed out for {account_email}")
        return False

    conn_id = f"conn-kimi-web-{account_prefix}"
    conn_name = f"Kimi Web ({account_prefix})"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    psd = json.dumps({"token": token, "access_token": token, "account": account_email})
    
    sql = """
    INSERT INTO provider_connections (
        id, provider, auth_type, name, email, priority, is_active,
        api_key, access_token, refresh_token, provider_specific_data,
        test_status, default_model, created_at, updated_at
    ) VALUES (?, 'kimi-web', 'cookie', ?, ?, 0, 1, ?, ?, ?, ?, 'healthy', 'k3', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        provider_specific_data = excluded.provider_specific_data,
        is_active = 1,
        test_status = 'healthy',
        updated_at = excluded.updated_at;
    """
    execute_remote_sql(sql, (conn_id, conn_name, account_email, token, token, refresh_token or "", psd, now, now))
    print(f"[REGISTERED] Connection '{conn_id}' active in Sentinel Proxy pool.")
    return True

def harvest_deepseek_session(account_email, auto_check=False):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n[HARVEST: DEEPSEEK] Target: {account_email}")
    print(f"[STORAGE] Isolated Profile: {profile_dir}")
    
    driver = launch_edge_browser(profile_dir, headless=auto_check)
    driver.get("https://chat.deepseek.com")
    
    if not auto_check:
        print("-" * 65)
        print(f"[ACTION REQUIRED] In the opened Edge browser:")
        print(f"  1. Click 'Sign In' -> 'Continue with Google'")
        print(f"  2. Select account: {account_email}")
        print(f"  3. Token extraction will complete automatically.")
        print("-" * 65)
    
    token = None
    max_wait = 180 if not auto_check else 15
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        time.sleep(2)
        try:
            local_storage = driver.execute_script("return {...window.localStorage};")
            for k, v in local_storage.items():
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
                print(f"[EXTRACTED] Valid DeepSeek authentication token verified.")
                break
        except Exception:
            pass

    driver.quit()
    
    if not token:
        print(f"\n[NOTICE] Jika disekat CAPTCHA berulang, anda boleh salin token terus dari pelayar biasa:")
        print(f"         1. Buka https://chat.deepseek.com dan log masuk.")
        print(f"         2. Tekan F12 -> Console -> taip: copy(localStorage.userToken) lalu Enter.")
        manual_token = input("\nTampal DeepSeek token di sini (atau tekan Enter untuk batal): ").strip()
        if manual_token:
            try:
                parsed = json.loads(manual_token)
                token = parsed.get("value") or manual_token
            except Exception:
                token = manual_token.strip('"')
        else:
            print(f"[ERROR] Sesi DeepSeek tidak berjaya diekstrak untuk {account_email}")
            return False

    conn_id = f"conn-deepseek-web-{account_prefix}"
    conn_name = f"DeepSeek Web ({account_prefix})"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    psd = json.dumps({"token": token, "userToken": token, "account": account_email})
    
    sql = """
    INSERT INTO provider_connections (
        id, provider, auth_type, name, email, priority, is_active,
        api_key, access_token, provider_specific_data,
        test_status, default_model, created_at, updated_at
    ) VALUES (?, 'deepseek-web', 'cookie', ?, ?, 0, 1, ?, ?, ?, 'healthy', 'deepseek-chat', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        access_token = excluded.access_token,
        provider_specific_data = excluded.provider_specific_data,
        is_active = 1,
        test_status = 'healthy',
        updated_at = excluded.updated_at;
    """
    execute_remote_sql(sql, (conn_id, conn_name, account_email, token, token, psd, now, now))
    print(f"[REGISTERED] Connection '{conn_id}' active in Sentinel Proxy pool.")
    return True

def harvest_zai_session(account_email, auto_check=False):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n[HARVEST: ZHIPU GLM] Target: {account_email}")
    print(f"[STORAGE] Isolated Profile: {profile_dir}")
    
    driver = launch_edge_browser(profile_dir, headless=auto_check)
    driver.get("https://chat.z.ai")
    
    if not auto_check:
        print("-" * 65)
        print(f"[ACTION REQUIRED] In the opened Edge browser:")
        print(f"  1. Sign in with Google: {account_email}")
        print(f"  2. Token extraction will complete automatically.")
        print("-" * 65)
    
    token = None
    max_wait = 180 if not auto_check else 15
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        time.sleep(2)
        try:
            local_storage = driver.execute_script("return {...window.localStorage};")
            for k, v in local_storage.items():
                if k == "token" and v and len(str(v)) > 20:
                    token = str(v).strip('"')
            if token:
                break
        except Exception:
            pass

    driver.quit()
    
    if not token:
        print(f"[ERROR] Z.ai session extraction timed out for {account_email}")
        return False

    conn_id = f"conn-zai-web-{account_prefix}"
    conn_name = f"Z.ai Web ({account_prefix})"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    psd = json.dumps({"token": token, "account": account_email})
    
    sql = """
    INSERT INTO provider_connections (
        id, provider, auth_type, name, email, priority, is_active,
        api_key, access_token, provider_specific_data,
        test_status, default_model, created_at, updated_at
    ) VALUES (?, 'zai-web', 'cookie', ?, ?, 0, 1, ?, ?, ?, 'healthy', 'glm-5.2', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        access_token = excluded.access_token,
        provider_specific_data = excluded.provider_specific_data,
        is_active = 1,
        test_status = 'healthy',
        updated_at = excluded.updated_at;
    """
    execute_remote_sql(sql, (conn_id, conn_name, account_email, token, token, psd, now, now))
    print(f"[REGISTERED] Connection '{conn_id}' active in Sentinel Proxy pool.")
    return True

def harvest_gemini_key(account_email):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n[HARVEST: GEMINI] Target: {account_email}")
    driver = launch_edge_browser(profile_dir)
    driver.get("https://aistudio.google.com/app/apikey")
    
    print("-" * 65)
    print(f"[ACTION REQUIRED] 1. Sign in with: {account_email}")
    print("                  2. Click 'Create API Key' (Free Tier)")
    print("                  3. Copy the key and paste it below.")
    print("-" * 65)
    
    api_key = input("Enter Gemini API Key (or press Enter to skip): ").strip()
    driver.quit()
    
    if not api_key:
        print("[SKIPPED] No key entered.")
        return False
        
    conn_id = f"conn-gemini-{account_prefix}"
    conn_name = f"Gemini Free ({account_prefix})"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    sql = """
    INSERT INTO provider_connections (
        id, provider, auth_type, name, email, priority, is_active,
        api_key, test_status, default_model, created_at, updated_at
    ) VALUES (?, 'gemini', 'apikey', ?, ?, 0, 1, ?, 'healthy', 'gemini-2.0-flash', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        is_active = 1,
        test_status = 'healthy',
        updated_at = excluded.updated_at;
    """
    execute_remote_sql(sql, (conn_id, conn_name, account_email, api_key, now, now))
    print(f"[REGISTERED] Connection '{conn_id}' active in Sentinel Proxy pool.")
    return True

def sync_gateway_combos():
    print("\n[PROVISION] Synchronizing gateway combos and model mappings...")
    from sync_gateway_combos import script
    from manage_sentinel import run_remote_py
    out, err = run_remote_py(script)
    if err and not out:
        print(f"[ERROR] Sync failed: {err}")
    else:
        print("[SUCCESS] Gateway combos and model mappings synchronized successfully.")

def show_pool_status():
    print("\n" + "=" * 70)
    print("  SENTINEL PROXY - FLEET & POOL STATUS")
    print("=" * 70)
    
    sql = "SELECT provider, id, name, auth_type, is_active, test_status, default_model FROM provider_connections ORDER BY provider, name;"
    rows = execute_remote_sql(sql)
    
    if not rows:
        print("No provider connections active.")
    else:
        print(f"{'PROVIDER':<20} | {'CONNECTION ID':<26} | {'STATUS':<8} | {'MODEL'}")
        print("-" * 70)
        for r in rows:
            status = "HEALTHY" if r[4] and r[5] == 'healthy' else ("ACTIVE" if r[4] else "INACTIVE")
            print(f"{r[0]:<20} | {r[1]:<26} | {status:<8} | {r[6] or 'N/A'}")
            
    print("\n" + "=" * 70)
    print("  CONFIGURED COMBOS & ROUTING PIPELINES")
    print("=" * 70)
    combos = execute_remote_sql("SELECT name, data FROM combos ORDER BY sort_order, name;")
    if combos:
        for c in combos:
            data = json.loads(c[1])
            models = [m.get('model') for m in data.get('models', [])]
            print(f"Combo: {c[0]:<22} | Strategy: {data.get('strategy', 'priority')}")
            print(f"  Pipeline: {' -> '.join(models)}")
            print("-" * 70)
            
    print("\n" + "=" * 70)
    print("  MODEL NAME MAPPINGS (AUTO-RESOLVED)")
    print("=" * 70)
    mappings = execute_remote_sql("SELECT pattern, combo_id, priority, enabled FROM model_combo_mappings ORDER BY priority DESC;")
    if mappings:
        for m in mappings:
            print(f"Pattern: {m[0]:<15} -> Target: {m[1]:<25} (Priority: {m[2]})")
    print("=" * 70 + "\n")

def test_gateway():
    print("\n" + "=" * 70)
    print("  SENTINEL PROXY - END-TO-END VERIFICATION")
    print("=" * 70)
    
    test_models = [
        "sentinel-flagship",
        "kimi-k3",
        "glm-5.3-flash",
        "deepseek-v4.1-flash"
    ]
    
    for m in test_models:
        payload = {
            "model": m,
            "messages": [{"role": "user", "content": "respond with strictly 'ONLINE' and model"}],
            "max_tokens": 20
        }
        start = time.time()
        try:
            res = requests.post(
                f"{GATEWAY_URL}/chat/completions",
                headers={"Authorization": f"Bearer {CLASS_API_KEY}", "Content-Type": "application/json"},
                json=payload,
                timeout=25
            )
            elapsed = time.time() - start
            if res.status_code == 200:
                data = res.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                clean_content = content.replace("\n", " ")[:35]
                print(f"[SUCCESS] {m:<22} | Latency: {elapsed:.2f}s | Output: {clean_content}")
            else:
                try:
                    err_json = res.json()
                    err_msg = err_json.get("error", {}).get("message", res.text[:70])
                except Exception:
                    err_msg = res.text[:70]
                clean_err = err_msg.replace("\n", " ")[:60]
                print(f"[FAILURE] {m:<22} | HTTP {res.status_code:<3} | Info: {clean_err}")
        except Exception as e:
            print(f"[TIMEOUT] {m:<22} | Network Error: {str(e)[:50]}")
    print("=" * 70 + "\n")

def export_client_configs():
    print("\n" + "=" * 70)
    print("  CLIENT SETUP CONFIGURATIONS (CLASSROOM HANDOUT)")
    print("=" * 70)
    print("1. CURSOR / VS CODE (Continue Extension ~/.continue/config.json):")
    continue_cfg = {
        "models": [
            {
                "title": "Sentinel Flagship (Auto-Failover)",
                "provider": "openai",
                "model": "sentinel-flagship",
                "apiKey": CLASS_API_KEY,
                "apiBase": GATEWAY_URL
            },
            {
                "title": "Kimi 3",
                "provider": "openai",
                "model": "kimi-k3",
                "apiKey": CLASS_API_KEY,
                "apiBase": GATEWAY_URL
            },
            {
                "title": "GLM 5.3 Flash",
                "provider": "openai",
                "model": "glm-5.3-flash",
                "apiKey": CLASS_API_KEY,
                "apiBase": GATEWAY_URL
            },
            {
                "title": "DeepSeek v4.1 Flash",
                "provider": "openai",
                "model": "deepseek-v4.1-flash",
                "apiKey": CLASS_API_KEY,
                "apiBase": GATEWAY_URL
            }
        ]
    }
    print(json.dumps(continue_cfg, indent=2))
    
    print("\n2. PYTHON OPENAI CLIENT EXAMPLE:")
    py_example = f"""from openai import OpenAI

client = OpenAI(
    api_key="{CLASS_API_KEY}",
    base_url="{GATEWAY_URL}"
)

response = client.chat.completions.create(
    model="sentinel-flagship",
    messages=[{{"role": "user", "content": "Hello Sentinel AI"}}]
)
print(response.choices[0].message.content)
"""
    print(py_example)
    print("=" * 70 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Sentinel Proxy Fleet & Account Manager")
    parser.add_argument("--status", action="store_true", help="Display fleet and pool status")
    parser.add_argument("--sync", action="store_true", help="Provision combos and model mappings")
    parser.add_argument("--test", action="store_true", help="Run end-to-end verification")
    parser.add_argument("--export", action="store_true", help="Export client setup configurations")
    parser.add_argument("--harvest-all", action="store_true", help="Harvest all providers for all 3 dummy accounts")
    parser.add_argument("--harvest-kimi", action="store_true", help="Harvest Kimi Web sessions")
    parser.add_argument("--harvest-deepseek", action="store_true", help="Harvest DeepSeek Web sessions")
    parser.add_argument("--harvest-zai", action="store_true", help="Harvest Zhipu GLM Web sessions")
    parser.add_argument("--harvest-gemini", action="store_true", help="Onboard Google Gemini API keys")
    parser.add_argument("--account", type=str, choices=DUMMY_ACCOUNTS, help="Target specific account")
    
    args = parser.parse_args()
    
    if args.status:
        show_pool_status()
    elif args.sync:
        sync_gateway_combos()
        show_pool_status()
    elif args.test:
        test_gateway()
    elif args.export:
        export_client_configs()
    elif args.harvest_all:
        targets = [args.account] if args.account else DUMMY_ACCOUNTS
        for acc in targets:
            print(f"\n>>> PROCESSING ACCOUNT: {acc} <<<")
            harvest_kimi_session(acc)
            harvest_deepseek_session(acc)
            harvest_zai_session(acc)
        show_pool_status()
    elif args.harvest_kimi:
        targets = [args.account] if args.account else DUMMY_ACCOUNTS
        for acc in targets:
            harvest_kimi_session(acc)
        show_pool_status()
    elif args.harvest_deepseek:
        targets = [args.account] if args.account else DUMMY_ACCOUNTS
        for acc in targets:
            harvest_deepseek_session(acc)
        show_pool_status()
    elif args.harvest_zai:
        targets = [args.account] if args.account else DUMMY_ACCOUNTS
        for acc in targets:
            harvest_zai_session(acc)
        show_pool_status()
    elif args.harvest_gemini:
        targets = [args.account] if args.account else DUMMY_ACCOUNTS
        for acc in targets:
            harvest_gemini_key(acc)
        show_pool_status()
    else:
        # Interactive CLI menu
        print("=" * 70)
        print("  SENTINEL PROXY - FLEET CONTROLLER & HARVESTER BOT")
        print("=" * 70)
        print("1. View Current Fleet & Pool Status")
        print("2. Synchronize Combos & Model Mappings (Kali DB)")
        print("3. Harvest Kimi Web Session (3 Dummy Accounts)")
        print("4. Harvest DeepSeek Web Session (3 Dummy Accounts)")
        print("5. Harvest Zhipu GLM (Z.ai) Session (3 Dummy Accounts)")
        print("6. Onboard Google Gemini Free API Keys")
        print("7. Run Complete Auto-Harvest Sequence")
        print("8. Run End-to-End Latency & Verification Suite")
        print("9. Export Client Setup Configurations (VS Code / Cursor)")
        print("0. Exit")
        print("-" * 70)
        
        choice = input("Select operation [0-9]: ").strip()
        
        if choice == "1":
            show_pool_status()
        elif choice == "2":
            sync_gateway_combos()
            show_pool_status()
        elif choice == "3":
            for acc in DUMMY_ACCOUNTS:
                harvest_kimi_session(acc)
            show_pool_status()
        elif choice == "4":
            for acc in DUMMY_ACCOUNTS:
                harvest_deepseek_session(acc)
            show_pool_status()
        elif choice == "5":
            for acc in DUMMY_ACCOUNTS:
                harvest_zai_session(acc)
            show_pool_status()
        elif choice == "6":
            for acc in DUMMY_ACCOUNTS:
                harvest_gemini_key(acc)
            show_pool_status()
        elif choice == "7":
            for acc in DUMMY_ACCOUNTS:
                print(f"\n>>> PROCESSING ACCOUNT: {acc} <<<")
                harvest_kimi_session(acc)
                harvest_deepseek_session(acc)
                harvest_zai_session(acc)
            show_pool_status()
        elif choice == "8":
            test_gateway()
        elif choice == "9":
            export_client_configs()
        else:
            print("Exiting controller.")

if __name__ == "__main__":
    main()
