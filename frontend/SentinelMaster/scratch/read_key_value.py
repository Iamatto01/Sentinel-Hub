import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
for r in cur.execute('SELECT key, sub_key, value FROM key_value WHERE key LIKE \\'%model%\\' OR sub_key LIKE \\'%f19e79bf%\\' OR value LIKE \\'%uncensored%\\'').fetchall():
    print(r[0], r[1], r[2][:150] if r[2] else 'None')
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
