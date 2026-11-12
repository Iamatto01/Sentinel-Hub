from manage_sentinel import run_remote_py

script = """
import sqlite3
import requests
import json

db_path = '/home/kali/server/9router-data/storage.sqlite'
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Test direct fetch from Kali to public endpoints
endpoints = [
    ("uncloseai", "https://uncloseai.com/v1/models"),
    ("theoldllm", "https://theoldllm.vercel.app/api/models"),
    ("opencode", "https://opencode.ai/zen/v1/models"),
    ("aihorde", "https://aihorde.net/api/v2/workers")
]

for name, url in endpoints:
    try:
        r = requests.get(url, timeout=5)
        print(f"[{name}] {url} -> Status {r.status_code}")
    except Exception as e:
        print(f"[{name}] Error: {e}")

conn.close()
"""

out, err = run_remote_py(script)
print(out)
if err:
    print("ERR:", err)
