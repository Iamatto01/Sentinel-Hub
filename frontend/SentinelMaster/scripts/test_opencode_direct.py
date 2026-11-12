from manage_sentinel import run_remote_py

script = """
import requests
import json

payload = {
    "model": "deepseek-v4-flash-free",
    "messages": [{"role": "user", "content": "respond with 'HELLO DEEPSEEK'"}]
}

try:
    r = requests.post(
        "https://opencode.ai/zen/v1/chat/completions",
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=10
    )
    print("STATUS:", r.status_code)
    print("RESPONSE:", r.text[:300])
except Exception as e:
    print("ERROR:", e)
"""

out, err = run_remote_py(script)
print(out)
