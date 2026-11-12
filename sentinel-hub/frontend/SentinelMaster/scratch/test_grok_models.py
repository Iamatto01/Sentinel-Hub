import os
import json
import urllib.request
import urllib.error

env_path = r"F:\INI KALI LA\Sentinel Master\.env.local"
key = None
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("HUB_ROUTER_KEY="):
            key = line.split("=", 1)[1].strip().strip('"\'')
            break

models = [
    "grok-cli/grok-composer-2.5-fast",
    "grok-cli/grok-4.6"
]

for m in models:
    url = "https://router.sentinelai.studio/v1/chat/completions"
    payload = {
        "model": m,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 20
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 SentinelTester/1.0"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"[{m}] => 200 OK: {repr(content[:60])}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[{m}] => HTTP {e.code}: {body[:150]}")
    except Exception as e:
        print(f"[{m}] => ERR: {e}")
