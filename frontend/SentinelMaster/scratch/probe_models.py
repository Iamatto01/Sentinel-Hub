import subprocess

remote_script = """import sqlite3, urllib.request, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
key = cur.execute("SELECT key FROM api_keys LIMIT 1").fetchone()[0]

models = [
    'antigravity/gemini-3.8-flash-high',
    'antigravity/gemini-pro-agent',
    'antigravity/gemini-3.1-pro-low',
    'antigravity/claude-sonnet-4-6',
    'antigravity/claude-opus-4-6-thinking',
    'grok-cli/grok-4.6',
    'grok-cli/grok-composer-2.5-fast'
]

for m in models:
    req = urllib.request.Request(
        'http://127.0.0.1:20128/v1/chat/completions',
        data=json.dumps({'model': m, 'messages': [{'role': 'user', 'content': 'hi'}]}).encode(),
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
            text = data['choices'][0]['message']['content']
            print(f"[{m}] => 200 OK: {repr(text[:60])}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[{m}] => HTTP {e.code}: {body[:90]}")
    except Exception as e:
        print(f"[{m}] => ERR: {e}")
"""

res = subprocess.run(['ssh', 'qexec', 'python3'], input=remote_script, text=True, capture_output=True)
print("STDOUT:\n" + res.stdout)
if res.stderr:
    print("STDERR:\n" + res.stderr)
