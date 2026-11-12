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

# 1. Update API Key permissions
c.execute(\"\"\"
UPDATE api_keys 
SET allowed_combos = '["combo/*"]', 
    allowed_models = '[]', 
    model_access_mode = 'all',
    is_active = 1 
WHERE key = 'sk-sentinel-class-vip';
\"\"\")

# 2. Define Combos
combos = [
    {
        "id": "combo-sentinel-flagship",
        "name": "sentinel-flagship",
        "strategy": "priority",
        "models": [
            {"model": "kimi-web/k3", "weight": 100},
            {"model": "zai-web/glm-5.2", "weight": 90},
            {"model": "deepseek-web/expert", "weight": 80},
            {"model": "gemini/gemini-2.0-flash", "weight": 70},
            {"model": "gemini/gemini-1.5-flash", "weight": 60},
            {"model": "opencode/deepseek-v4-flash-free", "weight": 50},
            {"model": "duckduckgo-web/claude-3-haiku", "weight": 40}
        ]
    },
    {
        "id": "combo-kimi-k3",
        "name": "kimi-k3",
        "strategy": "priority",
        "models": [
            {"model": "kimi-web/k3", "weight": 100},
            {"model": "opencode/kimi-k3", "weight": 50}
        ]
    },
    {
        "id": "combo-glm-5.3-flash",
        "name": "glm-5.3-flash",
        "strategy": "priority",
        "models": [
            {"model": "zai-web/glm-5.2", "weight": 100},
            {"model": "zai-web/GLM-5.1", "weight": 90},
            {"model": "opencode/glm-5.2", "weight": 50}
        ]
    },
    {
        "id": "combo-deepseek-v4.1-flash",
        "name": "deepseek-v4.1-flash",
        "strategy": "priority",
        "models": [
            {"model": "deepseek-web/expert", "weight": 100},
            {"model": "deepseek-web/default", "weight": 90},
            {"model": "opencode/deepseek-v4-flash-free", "weight": 50}
        ]
    },
    {
        "id": "combo-gemini-flash",
        "name": "gemini-flash",
        "strategy": "priority",
        "models": [
            {"model": "gemini/gemini-2.0-flash", "weight": 100},
            {"model": "gemini/gemini-1.5-flash", "weight": 90}
        ]
    },
    {
        "id": "combo-claude-3-haiku",
        "name": "claude-3-haiku",
        "strategy": "priority",
        "models": [
            {"model": "duckduckgo-web/claude-3-haiku", "weight": 100}
        ]
    }
]

for cb in combos:
    data = {
        "id": cb["id"],
        "name": cb["name"],
        "models": cb["models"],
        "strategy": cb["strategy"],
        "config": {},
        "isHidden": False,
        "sortOrder": 0,
        "createdAt": now,
        "updatedAt": now
    }
    c.execute(\"\"\"
    INSERT INTO combos (id, name, data, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        data = excluded.data,
        updated_at = excluded.updated_at;
    \"\"\", (cb["id"], cb["name"], json.dumps(data), now, now))

# 3. Model mappings
mappings = [
    ("mcm-flagship", "*flagship*", "combo-sentinel-flagship", 100, "Flagship routing"),
    ("mcm-kimi", "*kimi*", "combo-kimi-k3", 90, "Kimi 3 routing"),
    ("mcm-glm", "*glm*", "combo-glm-5.3-flash", 80, "GLM 5.3 routing"),
    ("mcm-deepseek", "*deepseek*", "combo-deepseek-v4.1-flash", 70, "DeepSeek routing"),
    ("mcm-gemini", "*gemini*", "combo-gemini-flash", 60, "Gemini routing"),
    ("mcm-claude", "*claude*", "combo-claude-3-haiku", 50, "Claude routing"),
]

for m_id, pat, c_id, prio, desc in mappings:
    c.execute(\"\"\"
    INSERT INTO model_combo_mappings (id, pattern, combo_id, priority, enabled, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        pattern = excluded.pattern,
        combo_id = excluded.combo_id,
        priority = excluded.priority,
        enabled = 1,
        description = excluded.description,
        updated_at = excluded.updated_at;
    \"\"\", (m_id, pat, c_id, prio, desc, now, now))

conn.commit()
print("PROVISIONED COMBOS & MAPPINGS SUCCESSFULLY")

for row in c.execute("SELECT name, data FROM combos;"):
    print("COMBO:", row[0])

for row in c.execute("SELECT pattern, combo_id, priority FROM model_combo_mappings;"):
    print("MAPPING:", row[0], "->", row[1], f"(prio {row[2]})")

conn.close()
"""

out, err = run_remote_py(script)
print(out)
if err:
    print("ERR:", err)
