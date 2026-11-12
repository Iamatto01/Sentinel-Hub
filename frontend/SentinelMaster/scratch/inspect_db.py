import sqlite3

db_uri = 'file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro'
con = sqlite3.connect(db_uri, uri=True)
cur = con.cursor()

cur.execute("SELECT id, pattern, combo_id FROM model_combo_mappings;")
rows = cur.fetchall()
print(f"--- MODEL COMBO MAPPINGS ({len(rows)}) ---")
for r in rows:
    print(r)
