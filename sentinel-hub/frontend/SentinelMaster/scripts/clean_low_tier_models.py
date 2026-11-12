import sys
import json
import datetime
sys.stdout.reconfigure(encoding='utf-8')
from manage_sentinel import run_remote_py

script = """
import sqlite3
import json
import datetime

db_path = '/home/kali/server/9router-data/storage.sqlite'
conn = sqlite3.connect(db_path)
c = conn.cursor()

now = datetime.datetime.now(datetime.timezone.utc).isoformat()

# 1. Purge low-tier / obsolete connections (DuckDuckGo web, Gemini Flash)
c.execute("DELETE FROM provider_connections WHERE id IN ('conn-duckduckgo-web', 'conn-gemini-flash');")

# 2. Purge obsolete combos and mappings
c.execute("DELETE FROM combos WHERE id IN ('combo-gemini-flash', 'combo-claude-3-haiku');")
c.execute("DELETE FROM model_combo_mappings WHERE id IN ('mcm-gemini', 'mcm-claude');")

# 3. Update sentinel-flagship: ONLY top-tier flagship frontier models
flagship_data = {
    "id": "combo-sentinel-flagship",
    "name": "sentinel-flagship",
    "strategy": "priority",
    "models": [
        {"model": "kimi-web/k3", "weight": 100},
        {"model": "zai-web/glm-5.2", "weight": 90},
        {"model": "deepseek-web/expert", "weight": 80}
    ],
    "config": {},
    "isHidden": False,
    "sortOrder": 0,
    "createdAt": now,
    "updatedAt": now
}

c.execute(\"\"\"
INSERT INTO combos (id, name, data, sort_order, created_at, updated_at)
VALUES ('combo-sentinel-flagship', 'sentinel-flagship', ?, 0, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    data = excluded.data,
    updated_at = excluded.updated_at;
\"\"\", (json.dumps(flagship_data), now, now))

# 4. Clean GLM combo: route to zai-web/glm-5.2 with GLM-5.1 fallback
glm_data = {
    "id": "combo-glm-5.3-flash",
    "name": "glm-5.3-flash",
    "strategy": "priority",
    "models": [
        {"model": "zai-web/glm-5.2", "weight": 100},
        {"model": "zai-web/GLM-5.1", "weight": 90}
    ],
    "config": {},
    "isHidden": False,
    "sortOrder": 0,
    "createdAt": now,
    "updatedAt": now
}

c.execute(\"\"\"
INSERT INTO combos (id, name, data, sort_order, created_at, updated_at)
VALUES ('combo-glm-5.3-flash', 'glm-5.3-flash', ?, 0, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    data = excluded.data,
    updated_at = excluded.updated_at;
\"\"\", (json.dumps(glm_data), now, now))

# 5. Clean DeepSeek combo: route to deepseek-web/expert (R1) with deepseek-web/default (V3) fallback
deepseek_data = {
    "id": "combo-deepseek-v4.1-flash",
    "name": "deepseek-v4.1-flash",
    "strategy": "priority",
    "models": [
        {"model": "deepseek-web/expert", "weight": 100},
        {"model": "deepseek-web/default", "weight": 90}
    ],
    "config": {},
    "isHidden": False,
    "sortOrder": 0,
    "createdAt": now,
    "updatedAt": now
}

c.execute(\"\"\"
INSERT INTO combos (id, name, data, sort_order, created_at, updated_at)
VALUES ('combo-deepseek-v4.1-flash', 'deepseek-v4.1-flash', ?, 0, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    data = excluded.data,
    updated_at = excluded.updated_at;
\"\"\", (json.dumps(deepseek_data), now, now))

conn.commit()
print("CLEANUP COMPLETED: Low-tier models purged.")

print("\\n=== REMAINING ACTIVE COMBOS ===")
for r in c.execute("SELECT name, data FROM combos;"):
    data = json.loads(r[1])
    models = [m.get('model') for m in data.get('models', [])]
    print(f"Combo: {r[0]} -> {' -> '.join(models)}")

print("\\n=== REMAINING MAPPINGS ===")
for r in c.execute("SELECT pattern, combo_id FROM model_combo_mappings;"):
    print(f"Mapping: {r[0]} -> {r[1]}")

conn.close()
"""

out, err = run_remote_py(script)
print(out)
if err:
    print("ERR:", err)
