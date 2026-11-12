from manage_sentinel import run_remote_py

script = """
import requests
import json

r = requests.get("https://opencode.ai/zen/v1/models", timeout=10)
data = r.json()
print("Total models:", len(data.get('data', [])))
for m in data.get('data', []):
    print(m.get('id'), "|", m.get('name', ''))
"""

out, err = run_remote_py(script)
print(out)
