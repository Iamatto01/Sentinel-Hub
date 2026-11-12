import urllib.request
import json
import http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# 1. Login
opener.open(urllib.request.Request(
    "http://127.0.0.1:20128/api/auth/login",
    data=json.dumps({"password": "sentinel_admin_secret_2026"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
))

# 2. Get combos
resp = opener.open("http://127.0.0.1:20128/api/combos")
combos = json.loads(resp.read().decode("utf-8")).get("combos", [])

# Rename mappings: strip ' (...)' from name
for c in combos:
    old_name = c.get("name", "")
    new_name = old_name.split(" (")[0].strip()
    if new_name != old_name:
        print(f"Renaming combo '{old_name}' -> '{new_name}'")
        c["name"] = new_name
        req_update = urllib.request.Request(
            f"http://127.0.0.1:20128/api/combos/{c['id']}",
            data=json.dumps(c).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT"
        )
        try:
            with opener.open(req_update) as uresp:
                print(f"Updated {new_name}: {uresp.status}")
        except Exception as e:
            print(f"Failed to update {new_name}: {e}")
