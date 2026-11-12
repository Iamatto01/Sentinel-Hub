import urllib.request
import json
import http.cookiejar
import time

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

login_url = "http://127.0.0.1:20128/api/auth/login"
req_login = urllib.request.Request(
    login_url,
    data=json.dumps({"password": "sentinel_admin_secret_2026"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with opener.open(req_login) as resp:
        print("Login status:", resp.status)
    
    combos_url = "http://127.0.0.1:20128/api/combos"
    with opener.open(combos_url) as resp:
        combos_data = resp.read().decode("utf-8")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_path = f"/mnt/external_hdd/9router/combos-backup-{timestamp}.json"
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(combos_data)
        print(f"Backed up {len(combos_data)} bytes to {backup_path}")
except Exception as e:
    print("Error:", e)
