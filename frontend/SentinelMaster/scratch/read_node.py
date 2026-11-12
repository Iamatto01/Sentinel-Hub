import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
cols = [d[0] for d in cur.execute('SELECT * FROM provider_nodes LIMIT 1').description]
for r in cur.execute('SELECT * FROM provider_nodes WHERE id LIKE \\'%f19e79bf%\\'').fetchall():
    print(json.dumps(dict(zip(cols, r)), indent=2))
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
