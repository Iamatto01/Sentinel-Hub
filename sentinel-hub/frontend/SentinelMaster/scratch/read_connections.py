import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
cols = [d[0] for d in cur.execute('SELECT * FROM provider_connections LIMIT 1').description]
print('COLS:', cols)
for r in cur.execute('SELECT * FROM provider_connections WHERE provider LIKE \\'%f19e79bf%\\'').fetchall():
    row = dict(zip(cols, r))
    if 'api_key' in row and row['api_key']:
        row['api_key'] = row['api_key'][:6] + '...'
    print(json.dumps(row, indent=2))
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
