import urllib.request
import json
import os
import sys

URL = os.environ.get("HUB_ROUTER_PUBLIC_URL", "https://router.sentinelai.studio").rstrip("/") + "/v1/chat/completions"
KEY = os.environ.get("HUB_ROUTER_KEY", "").strip()
if not KEY:
    print("[-] HUB_ROUTER_KEY is not set. Load it from Sentinel Master/.env.local first.")
    sys.exit(1)
MODEL = os.environ.get("SENTINEL_MODEL", "sentinel-uncensored")

print("=" * 60)
print("  SENTINEL-PENTEST UNCENSORED OPERATOR CONSOLE")
print(f"  Connected to: {URL}")
print(f"  Model: {MODEL}")
print("=" * 60)

prompt = input("\nEnter prompt (or press Enter for SQL Injection audit): ").strip()
if not prompt:
    prompt = "Audit this endpoint: GET /api/user?id=1' OR '1'='1 --. Provide finding, severity, evidence, and fix."

print("\n[+] Routing through OmniRoute cascade...")
body = {
    'model': MODEL,
    'messages': [{'role': 'user', 'content': prompt}]
}

req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0'
})

try:
    res = urllib.request.urlopen(req, timeout=90)
    data = json.loads(res.read().decode())
    print(f"\n[+] Served by: {data.get('model', 'unknown')}\n")
    print(data['choices'][0]['message']['content'])
except Exception as e:
    print(f"\n[-] Error: {e}")
