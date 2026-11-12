import urllib.request
import json
import http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# 1. Login
login_url = "http://127.0.0.1:20128/api/auth/login"
req_login = urllib.request.Request(
    login_url,
    data=json.dumps({"password": "sentinel_admin_secret_2026"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

with opener.open(req_login) as resp:
    print("Login status:", resp.status)

# 2. Get combo
combo_id = "7e77f294-9b27-47bf-9eea-323b635e4fc8"
with opener.open(f"http://127.0.0.1:20128/api/combos") as resp:
    combos = json.loads(resp.read().decode("utf-8")).get("combos", [])

target_combo = None
for c in combos:
    if c.get("id") == combo_id or c.get("name") == "sentinel-sonnet":
        target_combo = c
        break

if not target_combo:
    print("Target combo not found!")
    exit(1)

print("Current models:", [m["model"] for m in target_combo.get("models", [])])

# Add Gemini Pro Agent and Gemini 3.8 Flash High as failovers!
new_models = [
    {"id": "sson-03", "kind": "model", "model": "antigravity/gemini-pro-agent", "providerId": "antigravity", "weight": 95},
    {"id": "sson-04", "kind": "model", "model": "antigravity/gemini-3.8-flash-tiered", "providerId": "antigravity", "weight": 90},
    {"id": "sson-05", "kind": "model", "model": "antigravity/gemini-3.1-pro-low", "providerId": "antigravity", "weight": 85},
    {"id": "sson-01", "kind": "model", "model": "antigravity/claude-sonnet-4-6", "providerId": "antigravity", "weight": 50},
    {"id": "sson-02", "kind": "model", "model": "kiro/claude-sonnet-4.5", "providerId": "kiro", "weight": 40}
]

target_combo["models"] = new_models
target_combo["description"] = "Resilient Coding Cascade: Gemini 3.1 Pro (High) -> Gemini 3.8 Flash -> Gemini 3.1 Pro (Low) -> Claude fallback"

req_update = urllib.request.Request(
    f"http://127.0.0.1:20128/api/combos/{target_combo['id']}",
    data=json.dumps(target_combo).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="PUT"
)

try:
    with opener.open(req_update) as resp:
        print("Update status:", resp.status)
        res_data = json.loads(resp.read().decode("utf-8"))
        print("Updated response:", res_data.get("name") or res_data)
except Exception as e:
    print("Update failed:", e)
