import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
print(cur.execute('PRAGMA table_info(key_value)').fetchall())
for r in cur.execute('SELECT * FROM key_value WHERE value LIKE \\'%uncensored%\\'').fetchall():
    print(r[0], r[1][:100] if len(r)>1 and r[1] else '')
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
