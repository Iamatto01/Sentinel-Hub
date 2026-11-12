import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
for r in cur.execute('SELECT id, name, key, is_active FROM api_keys').fetchall():
    print(r[0], r[1], r[2][:8] + '...', r[3])
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('KEYS:\n' + stdout.read().decode())
ssh.close()
