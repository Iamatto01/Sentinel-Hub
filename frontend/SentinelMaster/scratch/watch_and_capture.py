import os, glob, re, json, time, base64, subprocess

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"

def get_latest_files():
    files = glob.glob(os.path.join(ldb_dir, "*.ldb")) + glob.glob(os.path.join(ldb_dir, "*.log"))
    return sorted(files, key=os.path.getmtime, reverse=True)

def push_token(provider, token, name="main"):
    print(f"\n[OMNIROUTE] Uploading {provider} token to OmniRoute...")
    sh = f"""
curl -s -c /tmp/omni.jar -X POST http://127.0.0.1:20128/api/auth/login -H 'Content-Type: application/json' -d '{{"password":"sentinel_admin_secret_2026"}}'
payload='{{"provider":"{provider}","entries":[{{"name":"{name}","credential":"{token}"}}],"priority":1}}'
curl -s -b /tmp/omni.jar -X POST http://127.0.0.1:20128/api/providers/bulk-web-session -H 'Content-Type: application/json' -d "$payload"
"""
    b64 = base64.b64encode(sh.encode()).decode()
    res = subprocess.run(["ssh", "-n", "qexec", f"echo '{b64}' | base64 -d | bash"], capture_output=True, text=True)
    print("[OMNIROUTE Output]:", res.stdout.strip())
    return "created" in res.stdout or "success" in res.stdout

def update_deepseek_combo():
    print("\n[OMNIROUTE] Updating deepseek-v4.1 and deepseek-v4-pro combos...")
    py = """
import json, subprocess
out = subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/providers']).decode()
providers_data = json.loads(out)
conns = [c for c in providers_data.get('connections', []) if c.get('provider') == 'deepseek-web' and c.get('isActive')]
if not conns:
    print('No active deepseek-web connections found.')
    exit(0)

models = []
for i, c in enumerate(conns):
    models.append({
        'id': f'ds-web-{i}',
        'kind': 'model',
        'providerId': 'deepseek-web',
        'model': 'deepseek-web/deepseek-chat',
        'weight': 100
    })
models.append({
    'id': 'ds-cfp-fallback',
    'kind': 'model',
    'providerId': 'cloudflare-playground',
    'model': 'cfp/deepseek-ai/deepseek-v4-pro-0813',
    'weight': 20
})

for name in ['deepseek-v4.1', 'deepseek-v4-pro']:
    # Get ID if exists
    combos = json.loads(subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/combos'])).get('combos', [])
    cid = next((cb['id'] for cb in combos if cb['name'] == name), None)
    payload = {'name': name, 'strategy': 'priority', 'models': models}
    if cid:
        cmd = ['curl', '-s', '-b', '/tmp/omni.jar', '-X', 'PUT', f'http://127.0.0.1:20128/api/combos/{cid}', '-H', 'Content-Type: application/json', '-d', json.dumps(payload)]
    else:
        cmd = ['curl', '-s', '-b', '/tmp/omni.jar', '-X', 'POST', 'http://127.0.0.1:20128/api/combos', '-H', 'Content-Type: application/json', '-d', json.dumps(payload)]
    res = subprocess.check_output(cmd).decode()
    print(f'Updated {name}:', res[:80])
"""
    b64 = base64.b64encode(py.encode()).decode()
    subprocess.run(["ssh", "-n", "qexec", f"echo '{b64}' | base64 -d | python3"])

def update_zai_combo():
    print("\n[OMNIROUTE] Updating glm-5.3 and glm-5.2 combos to real zai-web...")
    py = """
import json, subprocess
out = subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/providers']).decode()
providers_data = json.loads(out)
conns = [c for c in providers_data.get('connections', []) if c.get('provider') == 'zai-web' and c.get('isActive')]
if not conns:
    print('No active zai-web connections found.')
    exit(0)

models = []
for i, c in enumerate(conns):
    models.append({
        'id': f'zai-web-{i}',
        'kind': 'model',
        'providerId': 'zai-web',
        'model': 'zai-web/glm-5.2',
        'weight': 100
    })
models.append({
    'id': 'glm-cfp-fallback',
    'kind': 'model',
    'providerId': 'cloudflare-playground',
    'model': 'cfp/zai-org/glm-5.2',
    'weight': 20
})

for name in ['glm-5.3', 'glm-5.2', 'glm-3']:
    combos = json.loads(subprocess.check_output(['curl', '-s', '-b', '/tmp/omni.jar', 'http://127.0.0.1:20128/api/combos'])).get('combos', [])
    cid = next((cb['id'] for cb in combos if cb['name'] == name), None)
    payload = {'name': name, 'strategy': 'priority', 'models': models}
    if cid:
        cmd = ['curl', '-s', '-b', '/tmp/omni.jar', '-X', 'PUT', f'http://127.0.0.1:20128/api/combos/{cid}', '-H', 'Content-Type: application/json', '-d', json.dumps(payload)]
    else:
        cmd = ['curl', '-s', '-b', '/tmp/omni.jar', '-X', 'POST', 'http://127.0.0.1:20128/api/combos', '-H', 'Content-Type: application/json', '-d', json.dumps(payload)]
    res = subprocess.check_output(cmd).decode()
    print(f'Updated {name}:', res[:80])
"""
    b64 = base64.b64encode(py.encode()).decode()
    subprocess.run(["ssh", "-n", "qexec", f"echo '{b64}' | base64 -d | python3"])

def test_inference(model_name):
    sh = f"""
python3 -c "
import urllib.request, json
req = urllib.request.Request('http://127.0.0.1:20128/v1/chat/completions',
    data=json.dumps({{'model': '{model_name}', 'messages': [{{'role': 'user', 'content': 'Say SUCCESS in one word.'}}], 'max_tokens': 10}}).encode(),
    headers={{'Content-Type': 'application/json', 'Authorization': 'Bearer sk-9a2fddfa555eabbd-dnlkri-1f9e9b85'}})
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        res = json.loads(resp.read().decode())
        print('[LIVE TEST {model_name}]:', res.get('model'), '->', res.get('choices',[{{}}])[0].get('message',{{}}).get('content'))
except Exception as e:
    print('[LIVE TEST ERROR]:', e)
"
"""
    subprocess.run(["ssh", "-n", "qexec", sh])

def check_tokens():
    deepseek_token = None
    zai_token = None
    
    files = get_latest_files()[:4]
    for f in files:
        try:
            with open(f, "rb") as fp:
                data = fp.read()
                # Deepseek
                if not deepseek_token and b"deepseek" in data:
                    for m in re.finditer(rb'"value":"([A-Za-z0-9_-]{30,})"', data):
                        cand = m.group(1).decode("ascii")
                        if cand not in ["3sPXtY5lg7mK0qo2848CIpglqlS-ksO1YcWsJbcsFwDrzVV__RDNDI6jsLk5qCdj",
                                        "QypkAIq4aBRVQUBtnOdrWrN8gG_kPeqI3918W8COd9YfWW6IfumMP-hFBEMDwf12"]:
                            deepseek_token = cand
                            break
                # Z.ai
                if not zai_token and (b"chat.z.ai" in data or b"z.ai" in data):
                    for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{40,})', data):
                        cand = m.group(1).decode("ascii")
                        try:
                            p2 = cand.split('.')[1] + '=='
                            p = json.loads(base64.urlsafe_b64decode(p2).decode('utf-8', errors='ignore'))
                            if p.get('iss') == 'chat.z.ai' or 'z.ai' in str(p) or 'zhipu' in str(p):
                                zai_token = cand
                                break
                        except Exception:
                            pass
        except Exception:
            pass
            
    return deepseek_token, zai_token

print("Watcher initialized. Ready.")
