import subprocess, json

script = '''
PASS=$(grep HUB_DASHBOARD_PASSWORD /home/kali/server/SentinelMaster/.env.local | cut -d= -f2-)
curl -s -c /tmp/hub_cookie.jar -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" -d "{\\"password\\":\\"$PASS\\"}" > /dev/null

echo "--- /api/router ---"
curl -s -b /tmp/hub_cookie.jar http://127.0.0.1:3000/api/router | python3 -c '
import json, sys
d = json.load(sys.stdin)
data = d.get("data", {})
counts = data.get("counts", {})
print("Counts:", counts)
models = data.get("models", [])
print(f"Models length: {len(models)}")
if models:
    print("First 3 models:", models[:3])
'

echo "--- /api/router/credentials ---"
curl -s -b /tmp/hub_cookie.jar http://127.0.0.1:3000/api/router/credentials | python3 -c '
import json, sys
d = json.load(sys.stdin)
data = d.get("data", {})
print("Total models:", len(data.get("models", [])))
print("Combo models:", len(data.get("comboModels", [])))
print("Provider models:", len(data.get("providerModels", [])))
print("Sample models:", data.get("models", [])[:5])
'
'''
res = subprocess.run(['ssh', 'kali-n100', script], capture_output=True, text=True, encoding='utf-8')
print(res.stdout)
if res.stderr:
    print("ERR:", res.stderr)
