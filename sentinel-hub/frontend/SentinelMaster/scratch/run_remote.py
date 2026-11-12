import subprocess

script = '''
PASS=$(grep HUB_ROUTER_PASSWORD /home/kali/server/SentinelMaster/.env.local | cut -d= -f2-)
curl -s -c /tmp/omni_test.jar -X POST http://127.0.0.1:20128/api/auth/login -H "Content-Type: application/json" -d "{\\"password\\":\\"$PASS\\"}" > /dev/null
curl -s -b /tmp/omni_test.jar http://127.0.0.1:20128/api/models | python3 -c '
import json, sys
data = json.load(sys.stdin)
models = data.get("models") or []
for m in models:
    name = m.get("model") or m.get("id") or m.get("fullModel")
    prov = m.get("provider")
    full = m.get("fullModel")
    print(f"{name:40} | provider: {prov:20} | full: {full}")
'
'''
res = subprocess.run(['ssh', 'kali-n100', script], capture_output=True, text=True, encoding='utf-8')
print(res.stdout)
