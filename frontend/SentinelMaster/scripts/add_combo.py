import subprocess

script = '''
import sqlite3, json, datetime

conn = sqlite3.connect('/home/kali/server/9router-data/db/data.sqlite')
c = conn.cursor()
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
models = json.dumps([
    'ag/gemini-3.8-flash-high',
    'ag/claude-sonnet-4-6',
    'ag/gemini-3.7-flash-high'
])

c.execute("INSERT OR REPLACE INTO combos (id, name, kind, models, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
          ('combo-auto-001', 'auto', 'combo', models, now, now))
conn.commit()

for row in c.execute("SELECT * FROM combos"):
    print("COMBO ROW:", row)
conn.close()
'''

res = subprocess.run(
    ["ssh", "-o", "StrictHostKeyChecking=no", "kali@192.168.68.132", "python3 -"],
    input=script,
    capture_output=True,
    text=True
)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
