import sys
sys.stdout.reconfigure(encoding='utf-8')
from manage_sentinel import run_remote_py

script = """
import sqlite3

conn = sqlite3.connect('/home/kali/server/9router-data/storage.sqlite')
c = conn.cursor()

tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table';")]
print("TABLES:", tables)

for t in ["combos", "model_combo_mappings", "provider_connections", "api_keys"]:
    if t in tables:
        print(f"\\n--- SCHEMA {t} ---")
        for col in c.execute(f"PRAGMA table_info({t})"):
            print(col)
        print(f"--- SAMPLE {t} ---")
        for row in c.execute(f"SELECT * FROM {t} LIMIT 3"):
            print(row)

conn.close()
"""

out, err = run_remote_py(script)
print("OUT:\n", out)
if err:
    print("ERR:\n", err)
