from manage_sentinel import run_remote_py

script = """
import sqlite3
conn = sqlite3.connect('/home/kali/server/9router-data/storage.sqlite')
c = conn.cursor()
r = c.execute("SELECT * FROM provider_connections WHERE id='conn-deepseek-web-syifaputrixez'").fetchone()
for col, val in zip([d[0] for d in c.description], r):
    print(f"{col}: {val}")
conn.close()
"""
out, err = run_remote_py(script)
print(out)
