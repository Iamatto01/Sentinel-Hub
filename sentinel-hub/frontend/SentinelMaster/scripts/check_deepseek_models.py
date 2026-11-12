from manage_sentinel import run_remote_py

script = """
import json

with open('/home/kali/server/9router-data/model-catalog.json') as f:
    d = json.load(f)

print("Matching deepseek-v4.1:")
for k in d.get('models', {}):
    if 'deepseek-v4.1' in k:
        print(" ", k)

print("Matching deepseek-v4:")
for k in list(d.get('models', {}).keys()):
    if 'deepseek-v4' in k and not 'v4.1' in k:
        print(" ", k)
"""

out, err = run_remote_py(script)
print(out)
