import subprocess
import os

query = "SELECT key FROM api_keys WHERE name = 'VS CODE' LIMIT 1;"
p = subprocess.run(['ssh', 'qexec', 'sqlite3 /mnt/external_hdd/9router-data/storage.sqlite'], input=query, text=True, capture_output=True)
valid_key = p.stdout.strip()

if valid_key.startswith("sk-"):
    print(f"Fetched valid key from Kali: {valid_key[:8]}... (len={len(valid_key)})")
    env_local = r"F:\INI KALI LA\Sentinel Master\.env.local"
    lines = []
    updated = False
    with open(env_local, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("HUB_ROUTER_KEY="):
                lines.append(f'HUB_ROUTER_KEY="{valid_key}"\n')
                updated = True
            else:
                lines.append(line)
    if not updated:
        lines.append(f'HUB_ROUTER_KEY="{valid_key}"\n')
    with open(env_local, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("Successfully updated .env.local with active key!")
else:
    print("Failed to fetch key:", p.stderr, p.stdout)
