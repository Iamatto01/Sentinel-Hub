from manage_sentinel import run_remote_py

script = """
import sqlite3
conn = sqlite3.connect('/home/kali/server/9router-data/storage.sqlite')
c = conn.cursor()
for r in c.execute("SELECT id, provider, auth_type, name, is_active, test_status, last_error FROM provider_connections"):
    print(r)
conn.close()
"""
out, err = run_remote_py(script)
print(out)
