import json
import glob
import os

files = sorted(glob.glob('/home/kali/server/9router/combos-backup-*.json'), reverse=True)
if not files:
    print("No combos backup files found!")
    exit(0)

target = files[0]
print(f"Reading latest backup: {target}")

with open(target, 'r') as f:
    d = json.load(f)

combos = d.get('combos', [])
print(f"Total combos: {len(combos)}\n")

for c in combos:
    name = c.get('name')
    cid = c.get('id')
    strategy = c.get('strategy')
    models = c.get('models', [])
    print(f"=== Combo: {name} (ID: {cid}, Strategy: {strategy}) ===")
    for m in models:
        print(f"    - {m.get('model')} (provider: {m.get('providerId')}, weight: {m.get('weight')})")
    print()
