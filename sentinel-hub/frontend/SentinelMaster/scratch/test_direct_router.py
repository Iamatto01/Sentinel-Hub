import os
import json
import urllib.request

env_path = r"F:\INI KALI LA\Sentinel Master\.env.local"
key = None
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("HUB_ROUTER_KEY="):
            key = line.split("=", 1)[1].strip().strip('"\'')
            break

for model in ["sentinel-agent", "sentinel-sonnet"]:
    url = "https://router.sentinelai.studio/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Say hello in 3 words."}],
        "max_tokens": 30
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
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            served_by = data.get("model", "unknown")
            print(f"[{model}] => 200 OK! (served by: {served_by})\nOutput: {repr(content)}\n")
    except Exception as e:
        print(f"[{model}] => FAIL: {e}")
