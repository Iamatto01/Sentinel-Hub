#!/usr/bin/env python3
"""
Sentinel AI Fleet Controller & Multi-Account Harvester (Zero-Hassle Edition)
Onboards Google accounts into Groq, Gemini, and DeepSeek provider pools on OmniRoute.
"""

import os
import sys
import time
import json
import base64
import argparse
import datetime
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

REMOTE_DB_PATH = "/mnt/external_hdd/9router-data/storage.sqlite"

TARGET_ACCOUNTS = [
    "sentinelsystem002@gmail.com",
    "businessatto001@gmail.com",
    "sentinelstudio04@gmail.com",
    "syifaputrixez@gmail.com",
    "sentinelsystem001@gmail.com",
    "quu1788.ru@gmail.com",
    "chatgpt.atto.3@gmail.com",
    "chatgpt.atto.1@gmail.com"
]

def get_clipboard_text():
    try:
        import tkinter as tk
        r = tk.Tk()
        r.withdraw()
        txt = r.clipboard_get()
        r.destroy()
        return str(txt).strip()
    except Exception:
        return ""

def clear_clipboard():
    try:
        import tkinter as tk
        r = tk.Tk()
        r.withdraw()
        r.clipboard_clear()
        r.destroy()
    except Exception:
        pass

def execute_remote_sql(sql_query, params=()):
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
    res = subprocess.run(["ssh", "-n", "qexec", cmd], capture_output=True, text=True, encoding="utf-8")
    out = res.stdout.strip()
    err = res.stderr.strip()
    if err and not out:
        raise RuntimeError(f"SSH Execution Error: {err}")
    return json.loads(out) if out else None

def get_profile_path(account_email):
    account_prefix = account_email.split('@')[0]
    master_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_dir = os.path.join(master_dir, ".browser_profiles", account_prefix)
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def launch_edge_browser(user_data_dir=None):
    from selenium import webdriver
    from selenium.webdriver.edge.options import Options
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    if user_data_dir:
        opts.add_argument(f"--user-data-dir={user_data_dir}")
    driver = webdriver.Edge(options=opts)
    return driver

def harvest_deepseek_session(account_email):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n=======================================================")
    print(f"  [1/3] HARVESTING DEEPSEEK WEB: {account_email}")
    print(f"=======================================================")
    print(f"Opening Edge browser...")
    print(f">> ACTION: Click 'Sign in with Google' and choose: {account_email}")
    print(f">> Token will be detected automatically.")
    print("-" * 55)
    
    driver = launch_edge_browser(profile_dir)
    driver.get("https://chat.deepseek.com")
    
    token = None
    max_wait = 180
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
                print(f"[SUCCESS] DeepSeek session token captured!")
                break
        except Exception:
            pass

    driver.quit()
    
    if not token:
        print(f"[TIMEOUT] DeepSeek login was not completed within 3 minutes.")
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
    print(f"[SAVED] Connection '{conn_id}' active in Kali Gateway database.")
    return True

def harvest_gemini_key(account_email):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n=======================================================")
    print(f"  [2/3] HARVESTING GEMINI FREE API: {account_email}")
    print(f"=======================================================")
    print(f"Opening Edge browser to Google AI Studio...")
    print(f">> ACTION: Click 'Create API Key' -> click 'Copy'")
    print(f">> Script will auto-grab key from clipboard!")
    print("-" * 55)
    
    clear_clipboard()
    driver = launch_edge_browser(profile_dir)
    driver.get("https://aistudio.google.com/app/apikey")
    
    api_key = None
    max_wait = 180
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        time.sleep(1.5)
        clip = get_clipboard_text()
        if clip.startswith("AIza") and len(clip) > 30:
            api_key = clip
            print(f"[SUCCESS] Gemini API Key auto-captured from clipboard! ({api_key[:8]}...{api_key[-4:]})")
            break

    driver.quit()
    
    if not api_key:
        print(f"[TIMEOUT] Gemini key not captured within 3 minutes.")
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
    print(f"[SAVED] Connection '{conn_id}' active in Kali Gateway database.")
    return True

def harvest_groq_key(account_email):
    account_prefix = account_email.split('@')[0]
    profile_dir = get_profile_path(account_email)
    print(f"\n=======================================================")
    print(f"  [3/3] HARVESTING GROQ FREE API: {account_email}")
    print(f"=======================================================")
    print(f"Opening Edge browser to Groq Console...")
    print(f">> ACTION: Sign in with Google ({account_email}) -> Click 'Create API Key' -> click 'Copy'")
    print(f">> Script will auto-grab key from clipboard!")
    print("-" * 55)
    
    clear_clipboard()
    driver = launch_edge_browser(profile_dir)
    driver.get("https://console.groq.com/keys")
    
    api_key = None
    max_wait = 180
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        time.sleep(1.5)
        clip = get_clipboard_text()
        if clip.startswith("gsk_") and len(clip) > 30:
            api_key = clip
            print(f"[SUCCESS] Groq API Key auto-captured from clipboard! ({api_key[:8]}...{api_key[-4:]})")
            break

    driver.quit()
    
    if not api_key:
        print(f"[TIMEOUT] Groq key not captured within 3 minutes.")
        return False
        
    conn_id = f"conn-groq-{account_prefix}"
    conn_name = f"Groq Free ({account_prefix})"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    sql = """
    INSERT INTO provider_connections (
        id, provider, auth_type, name, email, priority, is_active,
        api_key, test_status, default_model, created_at, updated_at
    ) VALUES (?, 'groq', 'apikey', ?, ?, 0, 1, ?, 'healthy', 'llama-3.3-70b-versatile', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        is_active = 1,
        test_status = 'healthy',
        updated_at = excluded.updated_at;
    """
    execute_remote_sql(sql, (conn_id, conn_name, account_email, api_key, now, now))
    print(f"[SAVED] Connection '{conn_id}' active in Kali Gateway database.")
    return True

def main():
    parser = argparse.ArgumentParser(description="Zero-Hassle Multi-Account Harvester")
    parser.add_argument("--account", type=str, default="sentinelsystem002@gmail.com", help="Account email")
    parser.add_argument("--provider", type=str, choices=["deepseek", "gemini", "groq", "all"], default="all")
    
    args = parser.parse_args()
    acc = args.account
    
    print(f"\n>>> LAUNCHING ONBOARDING FOR: {acc} <<<")
    if args.provider in ["deepseek", "all"]:
        harvest_deepseek_session(acc)
    if args.provider in ["gemini", "all"]:
        harvest_gemini_key(acc)
    if args.provider in ["groq", "all"]:
        harvest_groq_key(acc)
    
    print(f"\n[DONE] Finished sequence for {acc}!\n")

if __name__ == "__main__":
    main()
