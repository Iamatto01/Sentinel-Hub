import urllib.request
import urllib.error
import json
import sqlite3

con = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = con.cursor()
cur.execute("SELECT key FROM api_keys WHERE is_active=1 LIMIT 1;")
key = cur.fetchone()[0]

test_models = [
    'aihorde/koboldcpp/Angelic_Eclipse-12B',
    'antigravity/gemini-pro-agent'
]

for m in test_models:
    req_body = json.dumps({
        "model": m,
        "messages": [{"role": "user", "content": "Reply with PONG"}],
        "max_tokens": 16,
        "stream": False
    }).encode('utf-8')

    req = urllib.request.Request(
        'http://127.0.0.1:20128/v1/chat/completions',
        data=req_body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {key}'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            data = json.loads(res.read().decode('utf-8'))
            print(f"[{m}] SUCCESS 200 | Served: {data.get('model')} | Content: {data['choices'][0]['message']['content'].strip()[:80]}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"[{m}] HTTP {e.code}: {err_body[:120]}")
    except Exception as e:
        print(f"[{m}] ERROR: {e}")
